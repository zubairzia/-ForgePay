const db = require('../../db');

// Local Postgres-backed vendor (outbound) payments service. Mirrors
// services/Payments/localService.js exactly, for the purchase side:
// vendor_payments/vendor_payment_allocations instead of
// payments/payment_allocations, and bills (direction = 'purchase')
// instead of invoices.

const round2 = (n) => Math.round(n * 100) / 100;

// Only documents in one of these statuses can accept a payment — same
// reasoning as PAYABLE_DOCUMENT_STATUSES in Payments/localService.js.
const PAYABLE_DOCUMENT_STATUSES = ['confirmed', 'partially_paid', 'overdue'];

const getAllVendorPayments = async (tenantId) => {
  const result = await db.query(
    'SELECT * FROM vendor_payments WHERE company_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows;
};

const getVendorPaymentById = async (tenantId, id) => {
  const result = await db.query(
    'SELECT * FROM vendor_payments WHERE company_id = $1 AND id = $2',
    [tenantId, id]
  );
  const vendorPayment = result.rows[0];
  if (!vendorPayment) {
    return undefined;
  }

  const allocations = await db.query(
    'SELECT * FROM vendor_payment_allocations WHERE company_id = $1 AND vendor_payment_id = $2 ORDER BY id',
    [tenantId, id]
  );
  return { ...vendorPayment, allocations: allocations.rows };
};

// Per-tenant sequential payment numbering, same SELECT ... FOR UPDATE
// pattern as nextPaymentNumber in Payments/localService.js and
// nextDocumentNumber in Documents/localService.js — locks the row in
// payment_number_sequences (sequence_type = 'vendor_payment') for the
// rest of this transaction so two concurrent vendor payments can't both
// read the same last_number. The (company_id, payment_number) UNIQUE
// index on vendor_payments remains as a backstop for the "no row yet"
// edge case.
const nextVendorPaymentNumber = async (client, tenantId) => {
  const seqResult = await client.query(
    "SELECT last_number FROM payment_number_sequences WHERE company_id = $1 AND sequence_type = 'vendor_payment' FOR UPDATE",
    [tenantId]
  );

  let nextNumber;
  if (seqResult.rows.length === 0) {
    nextNumber = 1;
    await client.query(
      "INSERT INTO payment_number_sequences (company_id, sequence_type, last_number) VALUES ($1, 'vendor_payment', $2)",
      [tenantId, nextNumber]
    );
  } else {
    nextNumber = seqResult.rows[0].last_number + 1;
    await client.query(
      "UPDATE payment_number_sequences SET last_number = $1, updated_at = now() WHERE company_id = $2 AND sequence_type = 'vendor_payment'",
      [nextNumber, tenantId]
    );
  }

  return `VPMT-${String(nextNumber).padStart(6, '0')}`;
};

// The big transaction: create the vendor payment, allocate it across the
// specified bills (locking each document row against concurrent
// allocations), flip each bill to paid/partially_paid, and write one
// ledger entry for the payment as a whole.
const recordVendorPayment = async (tenantId, data) => {
  if (!data.vendorId) {
    const err = new Error('vendorId is required');
    err.status = 400;
    throw err;
  }

  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('amount must be a positive number');
    err.status = 400;
    throw err;
  }

  const allocations = Array.isArray(data.allocations) ? data.allocations : [];
  if (allocations.length === 0) {
    const err = new Error('At least one allocation (documentId + allocatedAmount) is required');
    err.status = 400;
    throw err;
  }

  let allocatedSum = 0;
  for (const [index, allocation] of allocations.entries()) {
    const allocatedAmount = Number(allocation.allocatedAmount);
    if (!allocation.documentId) {
      const err = new Error(`Allocation ${index + 1}: documentId is required`);
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(allocatedAmount) || allocatedAmount <= 0) {
      const err = new Error(`Allocation ${index + 1}: allocatedAmount must be a positive number`);
      err.status = 400;
      throw err;
    }
    allocatedSum += allocatedAmount;
  }

  if (round2(allocatedSum) > round2(amount)) {
    const err = new Error('Sum of allocations cannot exceed the payment amount');
    err.status = 400;
    throw err;
  }

  let vendorPaymentId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const paymentNumber = await nextVendorPaymentNumber(client, tenantId);

    const paymentResult = await client.query(
      `INSERT INTO vendor_payments (
        company_id, vendor_id, payment_number, payment_date, amount,
        payment_method, reference_number, status, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        tenantId, data.vendorId, paymentNumber,
        data.paymentDate || new Date().toISOString().slice(0, 10), amount,
        data.paymentMethod || null, data.referenceNumber || null,
        'posted', data.notes || null,
      ]
    );
    const vendorPayment = paymentResult.rows[0];
    vendorPaymentId = vendorPayment.id;

    for (const allocation of allocations) {
      const allocatedAmount = round2(Number(allocation.allocatedAmount));

      const docResult = await client.query(
        'SELECT * FROM documents WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [tenantId, allocation.documentId]
      );
      const document = docResult.rows[0];
      if (!document) {
        const err = new Error(`Allocation references document ${allocation.documentId}, which does not exist`);
        err.status = 400;
        throw err;
      }
      if (document.direction !== 'purchase' || document.vendor_id !== data.vendorId) {
        const err = new Error(`Document ${allocation.documentId} does not belong to vendor ${data.vendorId}`);
        err.status = 400;
        throw err;
      }
      if (!PAYABLE_DOCUMENT_STATUSES.includes(document.status)) {
        const err = new Error(`Document ${allocation.documentId} is '${document.status}' and cannot accept a payment`);
        err.status = 409;
        throw err;
      }

      await client.query(
        `INSERT INTO vendor_payment_allocations (company_id, vendor_payment_id, document_id, allocated_amount)
         VALUES ($1,$2,$3,$4)`,
        [tenantId, vendorPayment.id, allocation.documentId, allocatedAmount]
      );

      const totalsResult = await client.query(
        `SELECT COALESCE(SUM(allocated_amount), 0) AS total
         FROM vendor_payment_allocations WHERE company_id = $1 AND document_id = $2`,
        [tenantId, allocation.documentId]
      );
      const totalAllocated = round2(Number(totalsResult.rows[0].total));
      const newStatus = totalAllocated >= round2(Number(document.total)) ? 'paid' : 'partially_paid';

      await client.query(
        'UPDATE documents SET status = $1, updated_at = now() WHERE company_id = $2 AND id = $3',
        [newStatus, tenantId, allocation.documentId]
      );
    }

    // One ledger entry for the payment as a whole, reducing accounts
    // payable (paying down what we owe is a debit against a normally
    // credit-balance liability account). Same single-sided simplification
    // noted in Payments/localService.js — no cash/bank account in the
    // current schema.
    await client.query(
      `INSERT INTO ledger_entries (
        company_id, source_type, vendor_payment_id, entry_type, account, amount, description
      ) VALUES ($1,'vendor_payment',$2,'debit','accounts_payable',$3,$4)`,
      [tenantId, vendorPayment.id, amount, `Vendor payment ${paymentNumber} made`]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getVendorPaymentById(tenantId, vendorPaymentId);
};

module.exports = {
  getAllVendorPayments,
  getVendorPaymentById,
  recordVendorPayment,
};
