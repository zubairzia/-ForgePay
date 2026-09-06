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
       WHERE rs.credit_account_id = ca.id AND rs.due_status NOT IN ('paid', 'waived', 'superseded')
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
            CASE WHEN due_status NOT IN ('paid', 'waived', 'superseded') AND due_date < CURRENT_DATE
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

// Waives some or all of the outstanding penalty on one installment.
// Balances are never edited directly outside this kind of function: the
// row is locked, the change is applied, the parent account's
// outstanding_penalty is recalculated from the schedule (never
// incremented independently of it), and a credit_account_events row
// records who did it and why. Only owner/finance_manager can call this
// (enforced at the route layer) -- reason is mandatory so there's always
// an audit trail explaining a discount to a customer's bill.
const waivePenalty = async (tenantId, userId, repaymentScheduleId, data) => {
  const reason = (data.reason || '').trim();
  if (!validator.isLength(reason, { min: 1 })) {
    const err = new Error('reason is required');
    err.status = 400;
    throw err;
  }
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('amount must be a positive number');
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const installmentResult = await client.query(
      'SELECT * FROM repayment_schedules WHERE company_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, repaymentScheduleId]
    );
    const installment = installmentResult.rows[0];
    if (!installment) {
      await client.query('ROLLBACK');
      return undefined;
    }

    const accountResult = await client.query(
      'SELECT status FROM credit_accounts WHERE company_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, installment.credit_account_id]
    );
    const accountStatus = accountResult.rows[0]?.status;
    if (!['active', 'overdue'].includes(accountStatus)) {
      const err = new Error(`Cannot waive a penalty on an account that is '${accountStatus}'`);
      err.status = 409;
      throw err;
    }

    const outstandingPenalty = round2(Number(installment.penalty_due) - Number(installment.penalty_paid));
    if (round2(amount) > outstandingPenalty) {
      const err = new Error(`Cannot waive more than the outstanding penalty (${outstandingPenalty})`);
      err.status = 400;
      throw err;
    }

    // Never below zero, never below penalty_paid -- guaranteed by the
    // check above (amount <= penalty_due - penalty_paid), not just hoped
    // for.
    const newPenaltyDue = round2(Number(installment.penalty_due) - amount);

    // If penalty was the only thing still outstanding on this
    // installment, waiving it fully settles the row. A superseded row
    // never reaches here (its account is checked above, but a superseded
    // row could theoretically still be 'active' account with a stray
    // waiver attempt) -- guarded explicitly rather than assumed.
    let newDueStatus = installment.due_status;
    if (!['paid', 'waived', 'superseded'].includes(installment.due_status)) {
      const principalRemaining = round2(Number(installment.principal_due) - Number(installment.principal_paid));
      const markupRemaining = round2(Number(installment.markup_due) - Number(installment.markup_paid));
      const penaltyRemaining = round2(newPenaltyDue - Number(installment.penalty_paid));
      if (round2(principalRemaining + markupRemaining + penaltyRemaining) <= 0) {
        newDueStatus = 'paid';
      }
    } else if (installment.due_status === 'superseded') {
      const err = new Error('Cannot waive a penalty on a superseded installment');
      err.status = 409;
      throw err;
    }

    await client.query(
      `UPDATE repayment_schedules SET
         penalty_due = $1,
         due_status = $2,
         paid_at = CASE WHEN $2 = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
         updated_at = now()
       WHERE id = $3`,
      [newPenaltyDue, newDueStatus, installment.id]
    );

    const outstandingResult = await client.query(
      `SELECT COALESCE(SUM(penalty_due - penalty_paid), 0) AS outstanding_penalty
       FROM repayment_schedules WHERE credit_account_id = $1 AND due_status <> 'superseded'`,
      [installment.credit_account_id]
    );
    await client.query(
      `UPDATE credit_accounts SET outstanding_penalty = $1, updated_at = now() WHERE id = $2`,
      [outstandingResult.rows[0].outstanding_penalty, installment.credit_account_id]
    );

    await client.query(
      `INSERT INTO credit_account_events (company_id, credit_account_id, event_type, event_data, performed_by)
       VALUES ($1, $2, 'PENALTY_WAIVED', $3, $4)`,
      [
        tenantId,
        installment.credit_account_id,
        JSON.stringify({ installmentNumber: installment.installment_number, amount, reason }),
        userId,
      ]
    );

    await client.query('COMMIT');

    const updated = await db.query('SELECT * FROM repayment_schedules WHERE id = $1', [installment.id]);
    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Pure computation shared by previewReschedule and rescheduleAccount, same
// role computeCreditAccountPlan plays for create/previewCreditAccount and
// computeAllocation plays for Repayments -- the caller fetches the current
// remaining (open) installments, this function turns them + the requested
// new terms into the replacement schedule, and neither preview nor the
// real action can ever compute a different answer from the same inputs.
//
// Design note on *why* superseded rows are kept and marked rather than
// filtered by repayment_schedules.version: every existing and future query
// that already filters to "open" statuses (an inclusion allow-list, e.g.
// WHERE due_status IN ('upcoming','due','partial','overdue')) needs zero
// changes to stay correct once 'superseded' exists, since it simply isn't
// in that list. A version-number filter would instead require every query
// to remember an explicit "WHERE version = (SELECT MAX(version)...)"
// clause, silently mixing old and new rows the moment one is missed.
// version is still incremented on the superseded row -- a real signal
// ("this installment slot was modified"), just not one anything's
// correctness depends on.
const computeReschedulePlan = (remainingInstallments, data) => {
  if (remainingInstallments.length === 0) {
    const err = new Error('This account has no remaining installments to reschedule');
    err.status = 409;
    throw err;
  }

  const installmentCount = Number(data.installmentCount);
  if (!Number.isInteger(installmentCount) || installmentCount < 1) {
    const err = new Error('installmentCount must be a positive integer');
    err.status = 400;
    throw err;
  }

  // Same explicit-fields philosophy as computeCreditAccountPlan: reschedule
  // replaces the plan wholesale rather than patching individual fields, so
  // there's no hidden "inherit the old frequency" default to get wrong.
  const installmentType = installmentCount === 1 ? 'one_time' : 'recurring';
  let installmentFrequency = null;
  if (installmentType === 'recurring') {
    installmentFrequency = data.installmentFrequency;
    if (!INSTALLMENT_FREQUENCIES.includes(installmentFrequency)) {
      const err = new Error(`installmentFrequency is required and must be one of: ${INSTALLMENT_FREQUENCIES.join(', ')} when rescheduling into more than one installment`);
      err.status = 400;
      throw err;
    }
  }

  if (!data.startDate || !validator.isISO8601(String(data.startDate))) {
    const err = new Error('startDate must be a valid date (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }

  const remainingPrincipal = round2(remainingInstallments.reduce((sum, i) => sum + (Number(i.principal_due) - Number(i.principal_paid)), 0));
  const remainingMarkup = round2(remainingInstallments.reduce((sum, i) => sum + (Number(i.markup_due) - Number(i.markup_paid)), 0));
  const remainingPenalty = round2(remainingInstallments.reduce((sum, i) => sum + (Number(i.penalty_due) - Number(i.penalty_paid)), 0));
  const remainingTotal = round2(remainingPrincipal + remainingMarkup + remainingPenalty);

  if (remainingTotal <= 0) {
    const err = new Error('This account has no remaining balance to reschedule');
    err.status = 409;
    throw err;
  }

  // Continues numbering after the highest installment_number that has ever
  // existed for this account (including superseded rows), since
  // uq_repayment_schedules_account_installment means those numbers stay
  // permanently occupied -- superseded rows are kept, not deleted.
  const startingInstallmentNumber = Number(data.nextInstallmentNumber);

  const schedule = [];
  let principalSoFar = 0;
  let markupSoFar = 0;
  let penaltySoFar = 0;
  let dueDate = new Date(data.startDate);

  for (let i = 0; i < installmentCount; i++) {
    const isLast = i === installmentCount - 1;
    // Rounding remainder absorbed into the last installment, independently
    // per component -- same technique buildSchedule uses for total_due.
    const principalDue = isLast ? round2(remainingPrincipal - principalSoFar) : round2(remainingPrincipal / installmentCount);
    const markupDue = isLast ? round2(remainingMarkup - markupSoFar) : round2(remainingMarkup / installmentCount);
    const penaltyDue = isLast ? round2(remainingPenalty - penaltySoFar) : round2(remainingPenalty / installmentCount);
    principalSoFar = round2(principalSoFar + principalDue);
    markupSoFar = round2(markupSoFar + markupDue);
    penaltySoFar = round2(penaltySoFar + penaltyDue);

    schedule.push({
      installmentNumber: startingInstallmentNumber + i,
      dueDate: formatDate(dueDate),
      principalDue, markupDue, penaltyDue,
      totalDue: round2(principalDue + markupDue + penaltyDue),
    });

    if (!isLast) dueDate = addInterval(dueDate, installmentFrequency);
  }

  return {
    installmentType, installmentFrequency, installmentCount,
    startDate: data.startDate,
    remainingPrincipal, remainingMarkup, remainingPenalty, remainingTotal,
    schedule,
    supersededInstallmentNumbers: remainingInstallments.map((i) => i.installment_number),
  };
};

const fetchRemainingInstallments = (client, tenantId, creditAccountId, forUpdate) => client.query(
  `SELECT * FROM repayment_schedules
   WHERE company_id = $1 AND credit_account_id = $2 AND due_status NOT IN ('paid', 'waived', 'superseded')
   ORDER BY installment_number${forUpdate ? ' FOR UPDATE' : ''}`,
  [tenantId, creditAccountId]
);

const fetchNextInstallmentNumber = async (client, creditAccountId) => {
  const result = await client.query(
    'SELECT COALESCE(MAX(installment_number), 0) AS max_number FROM repayment_schedules WHERE credit_account_id = $1',
    [creditAccountId]
  );
  return Number(result.rows[0].max_number) + 1;
};

// Read-only preview: fetches the account's current remaining installments
// (unlocked -- nothing is being changed) and runs them through
// computeReschedulePlan, without writing anything. Used by the reschedule
// form so its preview can never drift from what rescheduleAccount actually
// persists.
const previewReschedule = async (tenantId, creditAccountId, data) => {
  const accountResult = await db.query(
    'SELECT * FROM credit_accounts WHERE company_id = $1 AND id = $2',
    [tenantId, creditAccountId]
  );
  const account = accountResult.rows[0];
  if (!account) return undefined;
  if (!['active', 'overdue'].includes(account.status)) {
    const err = new Error(`Cannot reschedule an account that is '${account.status}'`);
    err.status = 409;
    throw err;
  }

  const remaining = await fetchRemainingInstallments(db, tenantId, creditAccountId, false);
  const nextInstallmentNumber = await fetchNextInstallmentNumber(db, creditAccountId);

  return computeReschedulePlan(remaining.rows, { ...data, nextInstallmentNumber });
};

// Replaces an account's remaining (unpaid/partially-paid) installments with
// a new schedule for exactly the remaining balance. Already-paid or
// -waived installments are never touched. Same discipline as waivePenalty:
// one transaction, everything locked, nothing computed twice, and a
// RESCHEDULED event captures the before/after terms.
const rescheduleAccount = async (tenantId, userId, creditAccountId, data) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const accountResult = await client.query(
      'SELECT * FROM credit_accounts WHERE company_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, creditAccountId]
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return undefined;
    }
    if (!['active', 'overdue'].includes(account.status)) {
      const err = new Error(`Cannot reschedule an account that is '${account.status}'`);
      err.status = 409;
      throw err;
    }

    // Locking every remaining row here is also what makes the unlocked
    // MAX(installment_number) read below safe without its own FOR UPDATE:
    // installment_number is never mutated by anything else in the app, and
    // any concurrent reschedule attempt on this same account would first
    // block trying to lock these same rows.
    const remaining = await fetchRemainingInstallments(client, tenantId, creditAccountId, true);
    const nextInstallmentNumber = await fetchNextInstallmentNumber(client, creditAccountId);

    const plan = computeReschedulePlan(remaining.rows, { ...data, nextInstallmentNumber });

    for (const old of remaining.rows) {
      await client.query(
        `UPDATE repayment_schedules SET due_status = 'superseded', version = version + 1, updated_at = now() WHERE id = $1`,
        [old.id]
      );
    }

    for (const line of plan.schedule) {
      await client.query(
        `INSERT INTO repayment_schedules (
          company_id, credit_account_id, installment_number, due_date,
          principal_due, markup_due, penalty_due, total_due,
          principal_paid, markup_paid, penalty_paid, due_status, version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,'upcoming',1)`,
        [tenantId, creditAccountId, line.installmentNumber, line.dueDate, line.principalDue, line.markupDue, line.penaltyDue, line.totalDue]
      );
    }

    const outstandingResult = await client.query(
      `SELECT
         COALESCE(SUM(principal_due - principal_paid), 0) AS outstanding_principal,
         COALESCE(SUM(markup_due - markup_paid), 0) AS outstanding_markup,
         COALESCE(SUM(penalty_due - penalty_paid), 0) AS outstanding_penalty,
         COUNT(*) FILTER (WHERE due_status <> 'superseded') AS total_installment_count
       FROM repayment_schedules WHERE credit_account_id = $1 AND due_status <> 'superseded'`,
      [creditAccountId]
    );
    const outstanding = outstandingResult.rows[0];
    const newMaturityDate = plan.schedule[plan.schedule.length - 1].dueDate;

    await client.query(
      `UPDATE credit_accounts SET
         outstanding_principal = $1, outstanding_markup = $2, outstanding_penalty = $3,
         installment_type = $4, installment_frequency = $5, installment_count = $6,
         maturity_date = $7, updated_at = now()
       WHERE id = $8`,
      [
        outstanding.outstanding_principal, outstanding.outstanding_markup, outstanding.outstanding_penalty,
        plan.installmentType, plan.installmentFrequency, outstanding.total_installment_count,
        newMaturityDate, creditAccountId,
      ]
    );

    await client.query(
      `INSERT INTO credit_account_events (company_id, credit_account_id, event_type, event_data, performed_by)
       VALUES ($1, $2, 'RESCHEDULED', $3, $4)`,
      [
        tenantId, creditAccountId,
        JSON.stringify({
          before: {
            installmentCount: remaining.rows.length,
            supersededInstallmentNumbers: plan.supersededInstallmentNumbers,
            remainingPrincipal: plan.remainingPrincipal,
            remainingMarkup: plan.remainingMarkup,
            remainingPenalty: plan.remainingPenalty,
          },
          after: {
            installmentType: plan.installmentType,
            installmentFrequency: plan.installmentFrequency,
            installmentCount: plan.installmentCount,
            startDate: plan.startDate,
            newInstallmentNumbers: plan.schedule.map((s) => s.installmentNumber),
          },
        }),
        userId,
      ]
    );

    await client.query('COMMIT');

    const insertedSchedule = await fetchSchedule(db, creditAccountId);
    const updatedAccount = await db.query('SELECT * FROM credit_accounts WHERE id = $1', [creditAccountId]);
    return { ...updatedAccount.rows[0], repaymentSchedule: insertedSchedule };
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
  waivePenalty,
  previewReschedule,
  rescheduleAccount,
};
