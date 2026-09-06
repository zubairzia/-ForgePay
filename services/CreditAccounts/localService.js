const db = require('../../db');
const validator = require('validator');

// Local Postgres-backed credit account service — the core of ForgePay's
// installment lending model. An account is opened with a fixed, disclosed
// markup (never an interest rate), then split into a repayment_schedules
// plan up front.

const STATUSES = ['draft', 'active', 'closed', 'overdue', 'defaulted', 'cancelled'];
const INSTALLMENT_TYPES = ['one_time', 'recurring'];
const INSTALLMENT_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'yearly'];

// Business-rule state machine, same pattern as
// services/Documents/localService.js's ALLOWED_STATUS_TRANSITIONS.
// draft -> active -> {closed, overdue, defaulted, cancelled} is exactly
// what was specified. 'overdue' additionally gets the same onward
// transitions as 'active' (including recovering back to 'active') — not
// explicitly specified, but without some way out of 'overdue', any
// account that ever misses a single payment would be permanently stuck.
// Flagging this as a judgment call, not a literal requirement.
const ALLOWED_STATUS_TRANSITIONS = {
  draft: ['active'],
  active: ['closed', 'overdue', 'defaulted', 'cancelled'],
  overdue: ['active', 'closed', 'defaulted', 'cancelled'],
  closed: [],
  defaulted: [],
  cancelled: [],
};

const round2 = (n) => Math.round(n * 100) / 100;

const addInterval = (date, frequency) => {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
};

const formatDate = (date) => date.toISOString().slice(0, 10);

// Builds the repayment_schedules rows for a new account. Mirrors the DB's
// chk_credit_accounts_installment CHECK — validated again here so the
// caller gets a clear 400, not a raw constraint-violation error.
const buildSchedule = (data, financedAmount, markupAmount, totalPayableAmount) => {
  if (data.installmentType === 'one_time') {
    return [{
      installmentNumber: 1,
      dueDate: data.startDate,
      principalDue: financedAmount,
      markupDue: markupAmount,
      totalDue: totalPayableAmount,
    }];
  }

  // recurring
  const count = data.installmentCount;
  const principalRatio = financedAmount / totalPayableAmount;
  const baseTotal = round2(totalPayableAmount / count);

  const schedule = [];
  let totalSoFar = 0;
  let dueDate = new Date(data.startDate);

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    // Rounding remainder absorbed into the final installment so the sum
    // exactly matches total_payable_amount.
    const totalDue = isLast ? round2(totalPayableAmount - totalSoFar) : baseTotal;
    totalSoFar = round2(totalSoFar + totalDue);

    const principalDue = round2(totalDue * principalRatio);
    const markupDue = round2(totalDue - principalDue);

    schedule.push({
      installmentNumber: i + 1,
      dueDate: formatDate(dueDate),
      principalDue,
      markupDue,
      totalDue,
    });

    dueDate = addInterval(dueDate, data.installmentFrequency);
  }

  return schedule;
};

const fetchSchedule = async (client, creditAccountId) => {
  const result = await client.query(
    'SELECT * FROM repayment_schedules WHERE credit_account_id = $1 ORDER BY installment_number',
    [creditAccountId]
  );
  return result.rows;
};

// Pure validation + computation shared by createCreditAccount and
// previewCreditAccount — the same math must produce the same schedule
// whether or not anything ends up persisted. Deliberately does NOT
// validate accountNumber (a preview has no reason to need one yet; it's
// only meaningful at actual creation time) and does no DB access at all.
const computeCreditAccountPlan = (data) => {
  if (!data.customerId) {
    const err = new Error('customerId is required');
    err.status = 400;
    throw err;
  }

  const principalAmount = Number(data.principalAmount);
  const downPaymentAmount = data.downPaymentAmount !== undefined ? Number(data.downPaymentAmount) : 0;
  const markupAmount = Number(data.markupAmount);

  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    const err = new Error('principalAmount must be a positive number');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(downPaymentAmount) || downPaymentAmount < 0) {
    const err = new Error('downPaymentAmount must be a non-negative number');
    err.status = 400;
    throw err;
  }
  if (downPaymentAmount > principalAmount) {
    const err = new Error('downPaymentAmount cannot exceed principalAmount');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(markupAmount) || markupAmount < 0) {
    const err = new Error('markupAmount must be a non-negative number');
    err.status = 400;
    throw err;
  }

  // The server computes financed_amount/total_payable_amount from
  // principal/down payment/markup — never trusts client-supplied totals,
  // same principle as services/Documents/localService.js.
  const financedAmount = round2(principalAmount - downPaymentAmount);
  const totalPayableAmount = round2(financedAmount + markupAmount);
  if (totalPayableAmount <= 0) {
    const err = new Error('total payable amount must be greater than zero');
    err.status = 400;
    throw err;
  }

  if (!INSTALLMENT_TYPES.includes(data.installmentType)) {
    const err = new Error(`installmentType must be one of: ${INSTALLMENT_TYPES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  let installmentFrequency = data.installmentFrequency || null;
  let installmentCount = data.installmentCount !== undefined ? Number(data.installmentCount) : 1;

  if (data.installmentType === 'recurring') {
    if (!INSTALLMENT_FREQUENCIES.includes(installmentFrequency)) {
      const err = new Error(`installmentFrequency is required and must be one of: ${INSTALLMENT_FREQUENCIES.join(', ')} when installmentType is 'recurring'`);
      err.status = 400;
      throw err;
    }
    if (!Number.isInteger(installmentCount) || installmentCount < 1) {
      const err = new Error('installmentCount must be a positive integer');
      err.status = 400;
      throw err;
    }
  } else {
    // one_time
    if (installmentFrequency) {
      const err = new Error("installmentFrequency must not be set when installmentType is 'one_time'");
      err.status = 400;
      throw err;
    }
    if (data.installmentCount !== undefined && installmentCount !== 1) {
      const err = new Error("installmentCount must be 1 when installmentType is 'one_time'");
      err.status = 400;
      throw err;
    }
    installmentCount = 1;
  }

  if (!data.startDate || !validator.isISO8601(String(data.startDate))) {
    const err = new Error('startDate must be a valid date (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }
  if (!data.maturityDate || !validator.isISO8601(String(data.maturityDate))) {
    const err = new Error('maturityDate must be a valid date (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }
  if (new Date(data.maturityDate) < new Date(data.startDate)) {
    const err = new Error('maturityDate cannot be before startDate');
    err.status = 400;
    throw err;
  }

  const schedule = buildSchedule(data, financedAmount, markupAmount, totalPayableAmount);

  return {
    customerId: data.customerId,
    vendorId: data.vendorId || null,
    sourceDocumentId: data.sourceDocumentId || null,
    principalAmount, downPaymentAmount, markupAmount, financedAmount, totalPayableAmount,
    installmentType: data.installmentType, installmentFrequency, installmentCount,
    startDate: data.startDate, maturityDate: data.maturityDate,
    schedule,
  };
};

// Read-only preview: runs the exact same computeCreditAccountPlan a real
// create would, and returns the plan (totals + full schedule) without
// touching the database at all. Used by the guided create form so its
// preview can never drift from what createCreditAccount actually persists.
const previewCreditAccount = (data) => computeCreditAccountPlan(data);

// CREATE credit account (header + repayment schedule + open event) — the
// important transaction.
const createCreditAccount = async (tenantId, data) => {
  const accountNumber = (data.accountNumber || '').trim();
  if (!validator.isLength(accountNumber, { min: 1 })) {
    const err = new Error('accountNumber is required');
    err.status = 400;
    throw err;
  }

  const plan = computeCreditAccountPlan(data);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Wrapped in the same transaction as the insert, same reasoning as
    // createLocalItem's duplicate item_code check — account_number has no
    // DB-generated default (same as items.item_code), so this is fully
    // caller-supplied. uq_credit_accounts_company_number is the backstop
    // for the remaining race window.
    const duplicate = await client.query(
      'SELECT id FROM credit_accounts WHERE company_id = $1 AND account_number = $2',
      [tenantId, accountNumber]
    );
    if (duplicate.rows.length > 0) {
      const err = new Error('Credit account already exists');
      err.status = 409;
      throw err;
    }

    const accountResult = await client.query(
      `INSERT INTO credit_accounts (
        company_id, account_number, customer_id, vendor_id, source_document_id,
        principal_amount, down_payment_amount, markup_amount, financed_amount, total_payable_amount,
        installment_type, installment_frequency, installment_count,
        start_date, maturity_date, status,
        outstanding_principal, outstanding_markup, outstanding_penalty,
        created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      ) RETURNING *`,
      [
        tenantId, accountNumber, plan.customerId, plan.vendorId, plan.sourceDocumentId,
        plan.principalAmount, plan.downPaymentAmount, plan.markupAmount, plan.financedAmount, plan.totalPayableAmount,
        plan.installmentType, plan.installmentFrequency, plan.installmentCount,
        plan.startDate, plan.maturityDate, 'draft',
        plan.financedAmount, plan.markupAmount, 0,
        data.createdBy || null,
      ]
    );
    const account = accountResult.rows[0];

    for (const line of plan.schedule) {
      await client.query(
        `INSERT INTO repayment_schedules (
          company_id, credit_account_id, installment_number, due_date,
          principal_due, markup_due, penalty_due, total_due,
          principal_paid, markup_paid, penalty_paid, due_status
        ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,0,0,0,'upcoming')`,
        [
          tenantId, account.id, line.installmentNumber, line.dueDate,
          line.principalDue, line.markupDue, line.totalDue,
        ]
      );
    }

    await client.query(
      `INSERT INTO credit_account_events (company_id, credit_account_id, event_type, event_data, performed_by)
       VALUES ($1, $2, 'ACCOUNT_OPENED', $3, $4)`,
      [
        tenantId, account.id,
        JSON.stringify({
          accountNumber, principalAmount: plan.principalAmount, downPaymentAmount: plan.downPaymentAmount,
          markupAmount: plan.markupAmount, financedAmount: plan.financedAmount, totalPayableAmount: plan.totalPayableAmount,
          installmentType: plan.installmentType, installmentCount: plan.installmentCount, installmentFrequency: plan.installmentFrequency,
        }),
        data.createdBy || null,
      ]
    );

    const insertedSchedule = await fetchSchedule(client, account.id);

    await client.query('COMMIT');
    return { ...account, repaymentSchedule: insertedSchedule };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// List view needs more than the raw row — customer_name (no join column on
// credit_accounts itself) and next_due_date/days_overdue (derived from the
// account's open repayment_schedules rows). Computed here once, server-
// side, rather than duplicated per-consumer or in frontend JS.
const getAllCreditAccounts = async (tenantId, filters = {}) => {
  const conditions = ['ca.company_id = $1'];
  const params = [tenantId];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`ca.status = $${params.length}`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    conditions.push(`ca.customer_id = $${params.length}`);
  }

  const result = await db.query(
    `SELECT
       ca.*,
       COALESCE(NULLIF(TRIM(c.company_name), ''),
                TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS customer_name,
       next_due.due_date AS next_due_date,
       CASE WHEN next_due.due_date IS NOT NULL AND next_due.due_date < CURRENT_DATE
            THEN (CURRENT_DATE - next_due.due_date)
            ELSE 0
       END AS days_overdue
     FROM credit_accounts ca
     JOIN customers c ON c.id = ca.customer_id
     LEFT JOIN LATERAL (
       SELECT rs.due_date
       FROM repayment_schedules rs
       WHERE rs.credit_account_id = ca.id AND rs.due_status NOT IN ('paid', 'waived')
       ORDER BY rs.due_date ASC
       LIMIT 1
     ) next_due ON true
     WHERE ${conditions.join(' AND ')}
     ORDER BY ca.created_at DESC`,
    params
  );
  return result.rows;
};

const getCreditAccountById = async (tenantId, id) => {
  const result = await db.query(
    `SELECT ca.*,
            COALESCE(NULLIF(TRIM(c.company_name), ''),
                     TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS customer_name
     FROM credit_accounts ca
     JOIN customers c ON c.id = ca.customer_id
     WHERE ca.company_id = $1 AND ca.id = $2`,
    [tenantId, id]
  );
  const account = result.rows[0];
  if (!account) {
    return undefined;
  }

  const schedule = await db.query(
    `SELECT *,
            CASE WHEN due_status NOT IN ('paid', 'waived') AND due_date < CURRENT_DATE
                 THEN (CURRENT_DATE - due_date) ELSE 0
            END AS days_overdue
     FROM repayment_schedules WHERE company_id = $1 AND credit_account_id = $2 ORDER BY installment_number`,
    [tenantId, id]
  );
  return { ...account, repaymentSchedule: schedule.rows };
};

// Read-only activity feed for the detail page, newest first.
const getCreditAccountEvents = async (tenantId, id) => {
  const account = await db.query(
    'SELECT id FROM credit_accounts WHERE company_id = $1 AND id = $2',
    [tenantId, id]
  );
  if (account.rows.length === 0) {
    return undefined;
  }

  const result = await db.query(
    'SELECT * FROM credit_account_events WHERE company_id = $1 AND credit_account_id = $2 ORDER BY created_at DESC',
    [tenantId, id]
  );
  return result.rows;
};

// Status transitions are business logic, validated against
// ALLOWED_STATUS_TRANSITIONS under FOR UPDATE, same pattern as
// updateDocumentStatus. Every transition is logged as a
// credit_account_events row.
const updateCreditAccountStatus = async (tenantId, id, newStatus, performedBy) => {
  if (!STATUSES.includes(newStatus)) {
    const err = new Error(`Invalid status: ${newStatus}`);
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT status FROM credit_accounts WHERE company_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return undefined;
    }

    const currentStatus = current.rows[0].status;
    const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(newStatus)) {
      const err = new Error(`Cannot transition credit account from '${currentStatus}' to '${newStatus}'`);
      err.status = 409;
      throw err;
    }

    const result = await client.query(
      'UPDATE credit_accounts SET status = $1, updated_at = now() WHERE company_id = $2 AND id = $3 RETURNING *',
      [newStatus, tenantId, id]
    );

    await client.query(
      `INSERT INTO credit_account_events (company_id, credit_account_id, event_type, event_data, performed_by)
       VALUES ($1, $2, 'STATUS_CHANGED', $3, $4)`,
      [tenantId, id, JSON.stringify({ from: currentStatus, to: newStatus }), performedBy || null]
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
  STATUSES,
  INSTALLMENT_TYPES,
  INSTALLMENT_FREQUENCIES,
  ALLOWED_STATUS_TRANSITIONS,
  createCreditAccount,
  previewCreditAccount,
  getAllCreditAccounts,
  getCreditAccountById,
  getCreditAccountEvents,
  updateCreditAccountStatus,
};
