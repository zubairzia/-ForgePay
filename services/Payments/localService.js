const db = require('../../db');

// Local Postgres-backed customer payments service. Mirrors the
// transaction-heavy style of createLocalCustomer, but the transaction
// here is bigger: one payment can touch several documents' statuses and
// always writes a ledger entry.

const round2 = (n) => Math.round(n * 100) / 100;

// Only documents in one of these statuses can accept a payment — paying
// down a 'draft' or 'cancelled' document doesn't make sense in the
// intended workflow (draft -> sent -> confirmed -> paid).
const PAYABLE_DOCUMENT_STATUSES = ['confirmed', 'partially_paid', 'overdue'];

const getAllPayments = async (tenantId) => {
  const result = await db.query(
    'SELECT * FROM payments WHERE company_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows;
};

const getPaymentById = async (tenantId, id) => {
  const result = await db.query(
    'SELECT * FROM payments WHERE company_id = $1 AND id = $2',
    [tenantId, id]
  );
  const payment = result.rows[0];
  if (!payment) {
    return undefined;
  }

  const allocations = await db.query(
    'SELECT * FROM payment_allocations WHERE company_id = $1 AND payment_id = $2 ORDER BY id',
    [tenantId, id]
  );
  return { ...payment, allocations: allocations.rows };
};

// Per-tenant sequential payment numbering, same SELECT ... FOR UPDATE
// pattern as nextDocumentNumber in services/Documents/localService.js —
// locks the row in payment_number_sequences for the rest of this
// transaction so two concurrent payments can't both read the same
// last_number. The (company_id, payment_number) UNIQUE index on payments
// remains as a backstop for the "no row yet" edge case (see the identical
// comment in Documents/localService.js's nextDocumentNumber).
const nextPaymentNumber = async (client, tenantId) => {
  const seqResult = await client.query(
    "SELECT last_number FROM payment_number_sequences WHERE company_id = $1 AND sequence_type = 'payment' FOR UPDATE",
    [tenantId]
  );

  let nextNumber;
  if (seqResult.rows.length === 0) {
    nextNumber = 1;
    await client.query(
      "INSERT INTO payment_number_sequences (company_id, sequence_type, last_number) VALUES ($1, 'payment', $2)",
      [tenantId, nextNumber]
    );
  } else {
    nextNumber = seqResult.rows[0].last_number + 1;
    await client.query(
      "UPDATE payment_number_sequences SET last_number = $1, updated_at = now() WHERE company_id = $2 AND sequence_type = 'payment'",
      [nextNumber, tenantId]
    );
  }

  return `PMT-${String(nextNumber).padStart(6, '0')}`;
};

// The big transaction: create the payment, allocate it across the
// specified documents (locking each document row so two concurrent
// payments against the same document can't both compute the same
// "already allocated" total), flip each document to paid/partially_paid,
// and write one ledger entry for the payment as a whole.
const recordPayment = async (tenantId, data) => {
  if (!data.customerId) {
    const err = new Error('customerId is required');
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

  let paymentId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const paymentNumber = await nextPaymentNumber(client, tenantId);

    const paymentResult = await client.query(
      `INSERT INTO payments (
        company_id, customer_id, payment_number, payment_date, amount,
        payment_method, reference_number, status, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        tenantId, data.customerId, paymentNumber,
        data.paymentDate || new Date().toISOString().slice(0, 10), amount,
        data.paymentMethod || null, data.referenceNumber || null,
        'posted', data.notes || null,
      ]
    );
    const payment = paymentResult.rows[0];
    paymentId = payment.id;

    for (const allocation of allocations) {
      const allocatedAmount = round2(Number(allocation.allocatedAmount));

      // Lock the document row so a concurrent payment against the same
      // document can't read the same "amount already allocated" total and
      // also conclude it's only partially paid.
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
      if (document.direction !== 'sales' || document.customer_id !== data.customerId) {
        const err = new Error(`Document ${allocation.documentId} does not belong to customer ${data.customerId}`);
        err.status = 400;
        throw err;
      }
      if (!PAYABLE_DOCUMENT_STATUSES.includes(document.status)) {
        const err = new Error(`Document ${allocation.documentId} is '${document.status}' and cannot accept a payment`);
        err.status = 409;
        throw err;
      }

      await client.query(
        `INSERT INTO payment_allocations (company_id, payment_id, document_id, allocated_amount)
         VALUES ($1,$2,$3,$4)`,
        [tenantId, payment.id, allocation.documentId, allocatedAmount]
      );

      const totalsResult = await client.query(
        `SELECT COALESCE(SUM(allocated_amount), 0) AS total
         FROM payment_allocations WHERE company_id = $1 AND document_id = $2`,
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
    // receivable. NOTE: ledger_entries.account has no cash/bank option, so
    // this is a single-sided AR-reduction entry rather than a full
    // double-entry debit/credit pair — a known simplification of the
    // current schema, not a full general ledger.
    await client.query(
      `INSERT INTO ledger_entries (
        company_id, source_type, payment_id, entry_type, account, amount, description
      ) VALUES ($1,'payment',$2,'credit','accounts_receivable',$3,$4)`,
      [tenantId, payment.id, amount, `Payment ${paymentNumber} received`]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getPaymentById(tenantId, paymentId);
};

module.exports = {
  getAllPayments,
  getPaymentById,
  recordPayment,
};
