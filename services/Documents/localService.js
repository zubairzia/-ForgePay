const db = require('../../db');

// Local Postgres-backed document service — the ONE implementation behind
// three document types (invoice, bill, credit_note), per the unified
// document pattern (documents header + document_lines) instead of a
// separate near-duplicate table/service per type. Thin per-type
// controllers (invoices.controller.js etc.) each call this with their
// document_type hardcoded.
//
// Quote, sales_order, and purchase_order were removed when ForgePay's
// product direction narrowed to an installment lending platform with
// invoicing underneath it, rather than a general CRM/ERP — see
// notes/migration_remove_so_quotes_po.sql.

const DOCUMENT_TYPES = ['invoice', 'bill', 'credit_note'];
const STATUSES = ['draft', 'sent', 'confirmed', 'paid', 'partially_paid', 'overdue', 'cancelled'];

// Direction is fixed by type for invoice/bill. credit_note is the one type
// that can go either way (a sales credit against a customer invoice, or a
// purchase-side credit against a bill), so its caller must supply
// data.direction explicitly.
const FIXED_DIRECTION_BY_TYPE = {
  invoice: 'sales',
  bill: 'purchase',
};

const NUMBER_PREFIX_BY_TYPE = {
  invoice: 'INV',
  bill: 'BILL',
  credit_note: 'CN',
};

// Business-rule state machine for updateDocumentStatus — status
// transitions are workflow, not a free-form field edit. 'overdue' is
// reachable from either confirmed or partially_paid (a normal invoice
// that's simply gone past its due_date unpaid); 'paid'/'cancelled' are
// terminal.
const ALLOWED_STATUS_TRANSITIONS = {
  draft: ['sent', 'confirmed', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['paid', 'partially_paid', 'overdue', 'cancelled'],
  partially_paid: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'partially_paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

const round2 = (n) => Math.round(n * 100) / 100;

// Per-tenant, per-document-type sequential numbering, using
// SELECT ... FOR UPDATE inside the caller's transaction to avoid the same
// class of race condition already fixed for the duplicate-email check in
// createLocalCustomer.
const nextDocumentNumber = async (client, tenantId, documentType) => {
  const seqResult = await client.query(
    'SELECT last_number FROM document_number_sequences WHERE company_id = $1 AND document_type = $2 FOR UPDATE',
    [tenantId, documentType]
  );

  let nextNumber;
  if (seqResult.rows.length === 0) {
    // No row yet for this (company, type) pair — FOR UPDATE has nothing to
    // lock here, so two concurrent "first document of this type" requests
    // could both reach this branch. The PRIMARY KEY on
    // document_number_sequences(company_id, document_type) turns that into
    // a loud unique-violation on the second INSERT instead of silently
    // handing out a duplicate document number — same belt-and-suspenders
    // pattern as the (company_id, email) constraint on customers.
    nextNumber = 1;
    await client.query(
      'INSERT INTO document_number_sequences (company_id, document_type, last_number) VALUES ($1, $2, $3)',
      [tenantId, documentType, nextNumber]
    );
  } else {
    nextNumber = seqResult.rows[0].last_number + 1;
    await client.query(
      'UPDATE document_number_sequences SET last_number = $1, updated_at = now() WHERE company_id = $2 AND document_type = $3',
      [nextNumber, tenantId, documentType]
    );
  }

  const prefix = NUMBER_PREFIX_BY_TYPE[documentType] || documentType.toUpperCase();
  return `${prefix}-${String(nextNumber).padStart(6, '0')}`;
};

const fetchLines = async (client, documentId) => {
  const result = await client.query(
    'SELECT * FROM document_lines WHERE document_id = $1 ORDER BY sort_order, id',
    [documentId]
  );
  return result.rows;
};

// Shared by createDocument and updateDocumentLines: validates a raw lines
// array and computes each line's total/tax. The server computes every
// monetary total from the submitted quantity/unitPrice/etc — never trusts
// a client-supplied line_total/subtotal/tax_total/total, since this is the
// financial system of record.
const buildLines = (rawLines) => {
  if (rawLines.length === 0) {
    const err = new Error('At least one line item is required');
    err.status = 400;
    throw err;
  }

  return rawLines.map((line, index) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const discountPercent = line.discountPercent !== undefined && line.discountPercent !== '' ? Number(line.discountPercent) : 0;
    const taxRate = line.taxRate !== undefined && line.taxRate !== '' ? Number(line.taxRate) : 0;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      const err = new Error(`Line ${index + 1}: quantity must be a positive number`);
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      const err = new Error(`Line ${index + 1}: unitPrice must be a non-negative number`);
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      const err = new Error(`Line ${index + 1}: discountPercent must be between 0 and 100`);
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(taxRate) || taxRate < 0) {
      const err = new Error(`Line ${index + 1}: taxRate must be a non-negative number`);
      err.status = 400;
      throw err;
    }

    const lineSubtotal = round2(quantity * unitPrice * (1 - discountPercent / 100));
    const lineTax = round2(lineSubtotal * (taxRate / 100));

    return {
      itemId: line.itemId || null,
      description: line.description || null,
      quantity,
      unitPrice,
      discountPercent,
      taxRate,
      lineTotal: lineSubtotal,
      lineTax,
      sortOrder: line.sortOrder !== undefined ? line.sortOrder : index,
    };
  });
};

// CREATE document (header + lines) — the important transaction.
const createDocument = async (tenantId, documentType, data) => {
  if (!DOCUMENT_TYPES.includes(documentType)) {
    const err = new Error(`Invalid document type: ${documentType}`);
    err.status = 400;
    throw err;
  }

  const direction = FIXED_DIRECTION_BY_TYPE[documentType] || data.direction;
  if (!['sales', 'purchase'].includes(direction)) {
    const err = new Error("direction must be 'sales' or 'purchase' (required for credit_note)");
    err.status = 400;
    throw err;
  }

  // Matches the DB's chk_documents_party CHECK constraint — validated here
  // too so the caller gets a clear 400 instead of a raw constraint-
  // violation error from Postgres.
  if (direction === 'sales' && !data.customerId) {
    const err = new Error('customerId is required for sales documents');
    err.status = 400;
    throw err;
  }
  if (direction === 'purchase' && !data.vendorId) {
    const err = new Error('vendorId is required for purchase documents');
    err.status = 400;
    throw err;
  }

  const rawLines = Array.isArray(data.lines) ? data.lines : [];
  const lines = buildLines(rawLines);

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const taxTotal = round2(lines.reduce((sum, l) => sum + l.lineTax, 0));
  const total = round2(subtotal + taxTotal);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const documentNumber = await nextDocumentNumber(client, tenantId, documentType);

    const docResult = await client.query(
      `INSERT INTO documents (
        company_id, document_type, direction, document_number,
        customer_id, vendor_id, related_document_id,
        issue_date, due_date, status, currency,
        subtotal, tax_total, total,
        reference_number, notes, terms, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      ) RETURNING *`,
      [
        tenantId, documentType, direction, documentNumber,
        data.customerId || null, data.vendorId || null, data.relatedDocumentId || null,
        data.issueDate || new Date().toISOString().slice(0, 10), data.dueDate || null,
        'draft', data.currency || null,
        subtotal, taxTotal, total,
        data.referenceNumber || null, data.notes || null, data.terms || null,
        data.createdBy || null,
      ]
    );
    const document = docResult.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO document_lines (
          company_id, document_id, item_id, description, quantity, unit_price,
          discount_percent, tax_rate, line_total, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          tenantId, document.id, line.itemId, line.description, line.quantity,
          line.unitPrice, line.discountPercent, line.taxRate, line.lineTotal, line.sortOrder,
        ]
      );
    }

    const insertedLines = await fetchLines(client, document.id);

    await client.query('COMMIT');
    return { ...document, lines: insertedLines };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// GET all, filtered by type — this one function is "list invoices" and
// "list bills" alike, just called with a different documentType.
const getAllDocuments = async (tenantId, documentType) => {
  const result = await db.query(
    'SELECT * FROM documents WHERE company_id = $1 AND document_type = $2 ORDER BY created_at DESC',
    [tenantId, documentType]
  );
  return result.rows;
};

const getDocumentById = async (tenantId, id) => {
  const result = await db.query(
    'SELECT * FROM documents WHERE company_id = $1 AND id = $2',
    [tenantId, id]
  );
  const document = result.rows[0];
  if (!document) {
    return undefined;
  }

  const lines = await db.query(
    'SELECT * FROM document_lines WHERE document_id = $1 ORDER BY sort_order, id',
    [id]
  );
  return { ...document, lines: lines.rows };
};

// General header edit — deliberately limited to non-financial,
// non-identity fields. It does NOT touch document_type/direction/
// customer_id/vendor_id (identity of the document), subtotal/tax_total/
// total/lines (only createDocument computes those), or status (see
// updateDocumentStatus below).
const updateDocument = async (tenantId, id, data) => {
  const result = await db.query(
    `UPDATE documents SET
      issue_date       = COALESCE($1, issue_date),
      due_date         = COALESCE($2, due_date),
      currency         = COALESCE($3, currency),
      reference_number = COALESCE($4, reference_number),
      notes            = COALESCE($5, notes),
      terms            = COALESCE($6, terms),
      updated_at       = now()
    WHERE company_id = $7 AND id = $8
    RETURNING *`,
    [
      data.issueDate ?? null, data.dueDate ?? null, data.currency ?? null,
      data.referenceNumber ?? null, data.notes ?? null, data.terms ?? null,
      tenantId, id,
    ]
  );

  return result.rows[0];
};

// Replaces a draft document's line items and recomputes header totals, all
// in one transaction. Deliberately restricted to 'draft' documents — once
// a document has been sent/confirmed, the numbers on it are what the
// customer/vendor has already seen, so editing them silently would be a
// real correctness problem, not just a UI inconvenience.
const updateDocumentLines = async (tenantId, id, rawLines) => {
  const lines = buildLines(Array.isArray(rawLines) ? rawLines : []);

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const taxTotal = round2(lines.reduce((sum, l) => sum + l.lineTax, 0));
  const total = round2(subtotal + taxTotal);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT status FROM documents WHERE company_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return undefined;
    }
    if (current.rows[0].status !== 'draft') {
      const err = new Error('Line items can only be edited while a document is in draft status');
      err.status = 409;
      throw err;
    }

    await client.query('DELETE FROM document_lines WHERE company_id = $1 AND document_id = $2', [tenantId, id]);

    for (const line of lines) {
      await client.query(
        `INSERT INTO document_lines (
          company_id, document_id, item_id, description, quantity, unit_price,
          discount_percent, tax_rate, line_total, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          tenantId, id, line.itemId, line.description, line.quantity,
          line.unitPrice, line.discountPercent, line.taxRate, line.lineTotal, line.sortOrder,
        ]
      );
    }

    const docResult = await client.query(
      `UPDATE documents SET subtotal = $1, tax_total = $2, total = $3, updated_at = now()
       WHERE company_id = $4 AND id = $5 RETURNING *`,
      [subtotal, taxTotal, total, tenantId, id]
    );

    const updatedLines = await fetchLines(client, id);

    await client.query('COMMIT');
    return { ...docResult.rows[0], lines: updatedLines };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Status transitions are business logic (draft -> sent -> confirmed ->
// paid), not a plain field edit — validated against
// ALLOWED_STATUS_TRANSITIONS, and the read-current-status + write is done
// under FOR UPDATE in one transaction so two concurrent transitions on the
// same document can't race past each other.
const updateDocumentStatus = async (tenantId, id, newStatus) => {
  if (!STATUSES.includes(newStatus)) {
    const err = new Error(`Invalid status: ${newStatus}`);
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT status FROM documents WHERE company_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return undefined;
    }

    const currentStatus = current.rows[0].status;
    const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(newStatus)) {
      const err = new Error(`Cannot transition document from '${currentStatus}' to '${newStatus}'`);
      err.status = 409;
      throw err;
    }

    const result = await client.query(
      'UPDATE documents SET status = $1, updated_at = now() WHERE company_id = $2 AND id = $3 RETURNING *',
      [newStatus, tenantId, id]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  DOCUMENT_TYPES,
  STATUSES,
  ALLOWED_STATUS_TRANSITIONS,
  createDocument,
  getAllDocuments,
  getDocumentById,
  updateDocument,
  updateDocumentLines,
  updateDocumentStatus,
};
