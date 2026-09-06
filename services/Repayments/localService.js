const db = require('../../db');
const paymentsService = require('../Payments/localService');

// Local Postgres-backed repayment-posting service — applies a payment
// against a credit_account's repayment_schedules according to the
// tenant's configured waterfall order (companies.payment_waterfall_order).

const round2 = (n) => Math.round(n * 100) / 100;

// Only accounts in one of these statuses can accept a repayment — mirrors
// PAYABLE_DOCUMENT_STATUSES in services/Payments/localService.js.
const PAYABLE_ACCOUNT_STATUSES = ['active', 'overdue'];

// Installments in any of these due_status values still have money owed on
// them; 'paid' and 'waived' are fully settled and excluded.
const OPEN_DUE_STATUSES = ['upcoming', 'due', 'partial', 'overdue'];

const WATERFALL_BUCKETS = {
  penalty_markup_principal: ['penalty', 'markup', 'principal'],
  principal_markup_penalty: ['principal', 'markup', 'penalty'],
};

// Pure allocation math, shared by recordRepayment (against locked, real
// rows, inside a transaction) and previewRepaymentAllocation (against
// freshly-read, unlocked rows, no transaction) — this is the ONE place
// that decides which installment/bucket a payment amount lands in, so a
// preview shown to a cashier can never drift from what actually posts.
const computeAllocation = (installments, amount, waterfallOrder) => {
  const buckets = WATERFALL_BUCKETS[waterfallOrder] || WATERFALL_BUCKETS.penalty_markup_principal;
  let remaining = round2(amount);
  const touchedInstallments = [];

  for (const installment of installments) {
    if (remaining <= 0) break;

    const paidBefore = {
      principal: Number(installment.principal_paid),
      markup: Number(installment.markup_paid),
      penalty: Number(installment.penalty_paid),
    };
    const due = {
      principal: Number(installment.principal_due),
      markup: Number(installment.markup_due),
      penalty: Number(installment.penalty_due),
    };
    const applied = { principal: 0, markup: 0, penalty: 0 };

    for (const bucket of buckets) {
      if (remaining <= 0) break;
      const bucketRemaining = round2(due[bucket] - paidBefore[bucket]);
      if (bucketRemaining <= 0) continue;

      const applyAmount = round2(Math.min(remaining, bucketRemaining));
      applied[bucket] = applyAmount;
      remaining = round2(remaining - applyAmount);
    }

    const totalAppliedToInstallment = round2(applied.principal + applied.markup + applied.penalty);
    if (totalAppliedToInstallment <= 0) continue;

    const newPaid = {
      principal: round2(paidBefore.principal + applied.principal),
      markup: round2(paidBefore.markup + applied.markup),
      penalty: round2(paidBefore.penalty + applied.penalty),
    };
    const totalPaid = round2(newPaid.principal + newPaid.markup + newPaid.penalty);
    const totalDue = round2(due.principal + due.markup + due.penalty);
    const newDueStatus = totalPaid >= totalDue ? 'paid' : 'partial';

    touchedInstallments.push({
      repaymentScheduleId: installment.id,
      installmentNumber: installment.installment_number,
      dueDate: installment.due_date,
      appliedPrincipal: applied.principal,
      appliedMarkup: applied.markup,
      appliedPenalty: applied.penalty,
      totalApplied: totalAppliedToInstallment,
      newPrincipalPaid: newPaid.principal,
      newMarkupPaid: newPaid.markup,
      newPenaltyPaid: newPaid.penalty,
      dueStatusAfter: newDueStatus,
    });
  }

  return { touchedInstallments, remainingUnapplied: remaining };
};

// Read-only preview: fetches the same open installments recordRepayment
// would lock, runs them through the exact same computeAllocation, and
// returns the result without writing anything. No transaction needed —
// nothing is mutated.
const previewRepaymentAllocation = async (tenantId, creditAccountId, amount) => {
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    const err = new Error('amount must be a positive number');
    err.status = 400;
    throw err;
  }

  const accountResult = await db.query(
    'SELECT * FROM credit_accounts WHERE company_id = $1 AND id = $2',
    [tenantId, creditAccountId]
  );
  const account = accountResult.rows[0];
  if (!account) {
    return undefined;
  }
  if (!PAYABLE_ACCOUNT_STATUSES.includes(account.status)) {
    const err = new Error(`Credit account is '${account.status}' and cannot accept a repayment`);
    err.status = 409;
    throw err;
  }

  const companyResult = await db.query('SELECT payment_waterfall_order FROM companies WHERE id = $1', [tenantId]);
  const waterfallOrder = companyResult.rows[0]?.payment_waterfall_order || 'penalty_markup_principal';

  const scheduleResult = await db.query(
    `SELECT * FROM repayment_schedules
     WHERE company_id = $1 AND credit_account_id = $2 AND due_status = ANY($3)
     ORDER BY due_date ASC, installment_number ASC`,
    [tenantId, creditAccountId, OPEN_DUE_STATUSES]
  );
  const installments = scheduleResult.rows;

  const totalOutstanding = round2(installments.reduce((sum, i) =>
    sum + (Number(i.principal_due) - Number(i.principal_paid))
        + (Number(i.markup_due) - Number(i.markup_paid))
        + (Number(i.penalty_due) - Number(i.penalty_paid)), 0));

  if (round2(amountNum) > totalOutstanding) {
    const err = new Error(`amount (${amountNum}) exceeds the total outstanding balance (${totalOutstanding})`);
    err.status = 400;
    throw err;
  }

  const { touchedInstallments, remainingUnapplied } = computeAllocation(installments, amountNum, waterfallOrder);

  return { waterfallOrder, installments: touchedInstallments, remainingUnapplied, totalOutstanding };
};

const getRepaymentsForAccount = async (tenantId, creditAccountId) => {
  const account = await db.query(
    'SELECT id FROM credit_accounts WHERE company_id = $1 AND id = $2',
    [tenantId, creditAccountId]
  );
  if (account.rows.length === 0) {
    return undefined;
  }

  const result = await db.query(
    `SELECT p.*, pa.repayment_schedule_id, pa.allocated_amount
     FROM payments p
     JOIN payment_allocations pa ON pa.payment_id = p.id
     JOIN repayment_schedules rs ON rs.id = pa.repayment_schedule_id
     WHERE p.company_id = $1 AND rs.credit_account_id = $2
     ORDER BY p.created_at DESC`,
    [tenantId, creditAccountId]
  );
  return result.rows;
};

// The core transaction: lock the account + its open installments, create
// the payment, walk the waterfall applying it installment by installment,
// update each touched installment and the account's outstanding totals,
// log an event, and write a ledger entry — all or nothing.
const recordRepayment = async (tenantId, creditAccountId, data) => {
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('amount must be a positive number');
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const companyResult = await client.query(
      'SELECT payment_waterfall_order FROM companies WHERE id = $1',
      [tenantId]
    );
    const waterfallOrder = companyResult.rows[0]?.payment_waterfall_order || 'penalty_markup_principal';

    const accountResult = await client.query(
      'SELECT * FROM credit_accounts WHERE company_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, creditAccountId]
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return undefined;
    }
    if (!PAYABLE_ACCOUNT_STATUSES.includes(account.status)) {
      const err = new Error(`Credit account is '${account.status}' and cannot accept a repayment`);
      err.status = 409;
      throw err;
    }

    const scheduleResult = await client.query(
      `SELECT * FROM repayment_schedules
       WHERE company_id = $1 AND credit_account_id = $2 AND due_status = ANY($3)
       ORDER BY due_date ASC, installment_number ASC
       FOR UPDATE`,
      [tenantId, creditAccountId, OPEN_DUE_STATUSES]
    );
    const installments = scheduleResult.rows;

    const totalOutstanding = round2(installments.reduce((sum, i) =>
      sum + (Number(i.principal_due) - Number(i.principal_paid))
          + (Number(i.markup_due) - Number(i.markup_paid))
          + (Number(i.penalty_due) - Number(i.penalty_paid)), 0));

    if (round2(amount) > totalOutstanding) {
      const err = new Error(`amount (${amount}) exceeds the total outstanding balance (${totalOutstanding})`);
      err.status = 400;
      throw err;
    }

    const paymentNumber = await paymentsService.nextPaymentNumber(client, tenantId);
    const paymentResult = await client.query(
      `INSERT INTO payments (
        company_id, customer_id, payment_number, payment_date, amount,
        payment_method, reference_number, status, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        tenantId, account.customer_id, paymentNumber,
        data.paymentDate || new Date().toISOString().slice(0, 10), amount,
        data.paymentMethod || null, data.referenceNumber || null,
        'posted', data.notes || null,
      ]
    );
    const payment = paymentResult.rows[0];

    // Same allocation math a preview would show — see computeAllocation.
    const { touchedInstallments } = computeAllocation(installments, amount, waterfallOrder);

    for (const touched of touchedInstallments) {
      // paid_at is only ever null here when not newly 'paid' — the query
      // that fetched `installments` excludes anything already 'paid'/
      // 'waived' (OPEN_DUE_STATUSES), so a touched installment never
      // already had a paid_at to preserve.
      await client.query(
        `UPDATE repayment_schedules SET
          principal_paid = $1, markup_paid = $2, penalty_paid = $3,
          due_status = $4, paid_at = $5, version = version + 1, updated_at = now()
        WHERE company_id = $6 AND id = $7`,
        [
          touched.newPrincipalPaid, touched.newMarkupPaid, touched.newPenaltyPaid,
          touched.dueStatusAfter, touched.dueStatusAfter === 'paid' ? new Date() : null,
          tenantId, touched.repaymentScheduleId,
        ]
      );

      await client.query(
        `INSERT INTO payment_allocations (company_id, payment_id, repayment_schedule_id, allocated_amount)
         VALUES ($1,$2,$3,$4)`,
        [tenantId, payment.id, touched.repaymentScheduleId, touched.totalApplied]
      );
    }

    // Recompute outstanding totals from the full schedule rather than
    // incrementally, so this can't drift from whatever's actually stored.
    // Excludes 'superseded' rows: a rescheduled installment's due/paid gap
    // is covered by its replacement row now, not by itself, so counting
    // both would double the outstanding balance.
    const outstandingResult = await client.query(
      `SELECT
        COALESCE(SUM(principal_due - principal_paid), 0) AS outstanding_principal,
        COALESCE(SUM(markup_due - markup_paid), 0) AS outstanding_markup,
        COALESCE(SUM(penalty_due - penalty_paid), 0) AS outstanding_penalty
      FROM repayment_schedules WHERE company_id = $1 AND credit_account_id = $2 AND due_status <> 'superseded'`,
      [tenantId, creditAccountId]
    );
    const outstanding = outstandingResult.rows[0];

    await client.query(
      `UPDATE credit_accounts SET
        outstanding_principal = $1, outstanding_markup = $2, outstanding_penalty = $3, updated_at = now()
      WHERE company_id = $4 AND id = $5`,
      [outstanding.outstanding_principal, outstanding.outstanding_markup, outstanding.outstanding_penalty, tenantId, creditAccountId]
    );

    await client.query(
      `INSERT INTO credit_account_events (company_id, credit_account_id, event_type, event_data, performed_by)
       VALUES ($1, $2, 'PAYMENT_POSTED', $3, $4)`,
      [
        tenantId, creditAccountId,
        JSON.stringify({
          paymentId: payment.id, paymentNumber, amount, waterfallOrder,
          installments: touchedInstallments,
        }),
        data.performedBy || null,
      ]
    );

    // Single ledger entry for the repayment as a whole, reducing accounts
    // receivable — same single-sided simplification already used in
    // services/Payments/localService.js (no cash/bank account in the
    // current schema).
    await client.query(
      `INSERT INTO ledger_entries (
        company_id, source_type, credit_account_id, entry_type, account, amount, description
      ) VALUES ($1,'credit_account',$2,'credit','accounts_receivable',$3,$4)`,
      [tenantId, creditAccountId, amount, `Repayment ${paymentNumber} applied to credit account ${account.account_number}`]
    );

    await client.query('COMMIT');

    return {
      payment,
      installments: touchedInstallments,
      outstanding: {
        principal: Number(outstanding.outstanding_principal),
        markup: Number(outstanding.outstanding_markup),
        penalty: Number(outstanding.outstanding_penalty),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  recordRepayment,
  previewRepaymentAllocation,
  getRepaymentsForAccount,
};
