const db = require('../../db');

const JOB_NAME = 'daily_status_update';

// Same shape as addInterval in services/CreditAccounts/localService.js --
// duplicated rather than imported since that one isn't exported, but kept
// in sync with the same four frequencies a credit account can have.
const addFrequency = (date, frequency) => {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
};

const round2 = (n) => Math.round(n * 100) / 100;

// Decides whether an already-overdue installment is due for a (further)
// late fee charge right now, per the company's late_fee_applies setting.
// This is the entire idempotency guarantee: every branch reduces to a
// comparison against repayment_schedules.last_penalty_charged_date, which
// is read and written inside the same row lock (SELECT ... FOR UPDATE)
// as the rest of this installment's processing, so two overlapping runs
// of the job can never both decide "yes, charge" for the same cycle --
// the second one blocks on the lock, then re-reads the now-updated date
// and correctly sees it's already been charged.
const isPenaltyDueNow = (installment, lateFeeApplies) => {
  const lastCharged = installment.last_penalty_charged_date;
  if (!lastCharged) return true;

  if (lateFeeApplies === 'once') {
    return false; // ever charged once = never again
  }
  if (lateFeeApplies === 'daily') {
    return lastCharged < installment.today; // both are 'YYYY-MM-DD' strings; string compare works for ISO dates
  }
  // per_period: recurs on the account's own installment cadence.
  const nextEligible = addFrequency(lastCharged, installment.installment_frequency);
  return new Date(installment.today) >= nextEligible;
};

const computeFeeAmount = (installment, company) => {
  if (company.late_fee_type === 'fixed') {
    return round2(Number(company.late_fee_amount));
  }
  // percentage: against this installment's OWN remaining unpaid balance
  // right now, not its original amount -- a partially-paid overdue
  // installment gets charged less than a fully-unpaid one, and each
  // recurrence (daily/per_period) recomputes against whatever's left as
  // payments come in.
  const remaining = round2(
    (Number(installment.principal_due) + Number(installment.markup_due) + Number(installment.penalty_due)) -
    (Number(installment.principal_paid) + Number(installment.markup_paid) + Number(installment.penalty_paid))
  );
  return round2(remaining * (Number(company.late_fee_amount) / 100));
};

// All four steps for one company, inside the caller's transaction.
// Returns how many records this company's run touched, for the job_runs
// summary.
const processCompany = async (client, company) => {
  let recordsProcessed = 0;
  const today = new Date().toISOString().slice(0, 10);

  // ------------------------------------------------------------
  // 1. due_status transitions. Never touches 'paid'/'waived'. 'partial'
  //    rows are included in the overdue check -- a partial payment
  //    doesn't stop something being late.
  // ------------------------------------------------------------
  const dueResult = await client.query(
    `UPDATE repayment_schedules
     SET due_status = 'due', updated_at = now()
     WHERE company_id = $1 AND due_status = 'upcoming' AND due_date = CURRENT_DATE
     RETURNING id`,
    [company.id]
  );
  recordsProcessed += dueResult.rowCount;

  const overdueResult = await client.query(
    `UPDATE repayment_schedules
     SET due_status = 'overdue', updated_at = now()
     WHERE company_id = $1
       AND due_status IN ('upcoming', 'due', 'partial')
       AND due_date < (CURRENT_DATE - $2::integer)
     RETURNING id`,
    [company.id, company.grace_period_days]
  );
  recordsProcessed += overdueResult.rowCount;

  // ------------------------------------------------------------
  // 2. Late fees on whatever is overdue now (including rows that were
  //    already overdue from a previous run, not just ones that just
  //    transitioned above).
  // ------------------------------------------------------------
  if (company.late_fee_type !== 'none') {
    const overdueInstallments = await client.query(
      `SELECT rs.*, ca.installment_frequency
       FROM repayment_schedules rs
       JOIN credit_accounts ca ON ca.id = rs.credit_account_id
       WHERE rs.company_id = $1 AND rs.due_status = 'overdue'
       FOR UPDATE OF rs`,
      [company.id]
    );

    const touchedAccountIds = new Set();

    for (const installment of overdueInstallments.rows) {
      touchedAccountIds.add(installment.credit_account_id);

      if (!isPenaltyDueNow({ ...installment, today }, company.late_fee_applies)) {
        continue;
      }

      const feeAmount = computeFeeAmount(installment, company);
      if (feeAmount <= 0) continue;

      await client.query(
        `UPDATE repayment_schedules
         SET penalty_due = penalty_due + $1, last_penalty_charged_date = CURRENT_DATE, updated_at = now()
         WHERE id = $2`,
        [feeAmount, installment.id]
      );

      await client.query(
        `INSERT INTO credit_account_events (company_id, credit_account_id, event_type, event_data, performed_by)
         VALUES ($1, $2, 'PENALTY_APPLIED', $3, NULL)`,
        [
          company.id,
          installment.credit_account_id,
          JSON.stringify({
            installmentNumber: installment.installment_number,
            dueDate: installment.due_date,
            feeAmount,
            feeType: company.late_fee_type,
            appliesType: company.late_fee_applies,
            source: 'daily_status_update',
          }),
        ]
      );

      recordsProcessed += 1;
    }

    // Recalculate outstanding_penalty for every account touched above,
    // same pattern services/Repayments/localService.js uses for
    // outstanding_principal/outstanding_markup after posting a payment --
    // derived from the schedule rows, never incremented independently of
    // them.
    for (const accountId of touchedAccountIds) {
      await client.query(
        `UPDATE credit_accounts SET
           outstanding_penalty = (
             SELECT COALESCE(SUM(penalty_due - penalty_paid), 0)
             FROM repayment_schedules WHERE credit_account_id = $1
           ),
           updated_at = now()
         WHERE id = $1`,
        [accountId]
      );
    }
  }

  // ------------------------------------------------------------
  // 3 & 4. Account-level status rollup + STATUS_CHANGED events.
  //    active -> overdue when any installment is overdue;
  //    overdue -> active when none are. Only touches accounts already in
  //    one of those two states -- draft/closed/defaulted/cancelled are
  //    left alone, matching ALLOWED_STATUS_TRANSITIONS in
  //    services/CreditAccounts/localService.js.
  // ------------------------------------------------------------
  const toOverdue = await client.query(
    `SELECT id FROM credit_accounts
     WHERE company_id = $1 AND status = 'active'
       AND EXISTS (
         SELECT 1 FROM repayment_schedules
         WHERE credit_account_id = credit_accounts.id AND due_status = 'overdue'
       )
     FOR UPDATE`,
    [company.id]
  );
  for (const account of toOverdue.rows) {
    await client.query(
      `UPDATE credit_accounts SET status = 'overdue', updated_at = now() WHERE id = $1`,
      [account.id]
    );
    await client.query(
      `INSERT INTO credit_account_events (company_id, credit_account_id, event_type, event_data, performed_by)
       VALUES ($1, $2, 'STATUS_CHANGED', $3, NULL)`,
      [company.id, account.id, JSON.stringify({ from: 'active', to: 'overdue', source: 'daily_status_update' })]
    );
    recordsProcessed += 1;
  }

  const toActive = await client.query(
    `SELECT id FROM credit_accounts
     WHERE company_id = $1 AND status = 'overdue'
       AND NOT EXISTS (
         SELECT 1 FROM repayment_schedules
         WHERE credit_account_id = credit_accounts.id AND due_status = 'overdue'
       )
     FOR UPDATE`,
    [company.id]
  );
  for (const account of toActive.rows) {
    await client.query(
      `UPDATE credit_accounts SET status = 'active', updated_at = now() WHERE id = $1`,
      [account.id]
    );
    await client.query(
      `INSERT INTO credit_account_events (company_id, credit_account_id, event_type, event_data, performed_by)
       VALUES ($1, $2, 'STATUS_CHANGED', $3, NULL)`,
      [company.id, account.id, JSON.stringify({ from: 'overdue', to: 'active', source: 'daily_status_update' })]
    );
    recordsProcessed += 1;
  }

  return recordsProcessed;
};

// Entry point -- called by both the cron schedule (see jobs/scheduler.js)
// and the manual trigger endpoint (controllers/jobs.controller.js), so
// there is exactly one implementation of what "run the daily job" means.
const runDailyStatusUpdate = async () => {
  const jobRunResult = await db.query(
    `INSERT INTO job_runs (job_name, status) VALUES ($1, 'running') RETURNING id`,
    [JOB_NAME]
  );
  const jobRunId = jobRunResult.rows[0].id;

  let totalRecordsProcessed = 0;
  const companyErrors = [];

  const companiesResult = await db.query(
    `SELECT id, grace_period_days, late_fee_type, late_fee_amount, late_fee_applies FROM companies`
  );

  // Each company gets its own connection and transaction, so one
  // company's failure rolls back only that company's half-applied
  // changes -- every other company's work already committed stays
  // committed.
  for (const company of companiesResult.rows) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const processed = await processCompany(client, company);
      await client.query('COMMIT');
      totalRecordsProcessed += processed;
    } catch (err) {
      await client.query('ROLLBACK');
      companyErrors.push(`company ${company.id}: ${err.message}`);
    } finally {
      client.release();
    }
  }

  const status = companyErrors.length > 0 ? 'failed' : 'success';
  const errorMessage = companyErrors.length > 0 ? companyErrors.join('; ') : null;

  await db.query(
    `UPDATE job_runs SET finished_at = now(), status = $1, records_processed = $2, error_message = $3 WHERE id = $4`,
    [status, totalRecordsProcessed, errorMessage, jobRunId]
  );

  return { jobRunId, status, recordsProcessed: totalRecordsProcessed, errors: companyErrors };
};

module.exports = { runDailyStatusUpdate, JOB_NAME };
