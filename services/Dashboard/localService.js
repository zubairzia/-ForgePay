const db = require('../../db');

// Dashboard summary — read-only aggregate queries across credit_accounts,
// repayment_schedules, and payments. Everything is tenant-scoped via
// company_id, same convention as every other service.

const getDashboardSummary = async (tenantId) => {
  // Run the independent queries concurrently rather than sequentially —
  // none of them depend on each other's results.
  const [totals, dueToday, overdueAmount, activeCount, needsAttention, recentPayments] =
    await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(outstanding_principal + outstanding_markup + outstanding_penalty), 0) AS total
         FROM credit_accounts
         WHERE company_id = $1 AND status IN ('active', 'overdue')`,
        [tenantId]
      ),

      db.query(
        `SELECT COALESCE(SUM(rs.total_due - (rs.principal_paid + rs.markup_paid + rs.penalty_paid)), 0) AS total
         FROM repayment_schedules rs
         JOIN credit_accounts ca ON ca.id = rs.credit_account_id
         WHERE rs.company_id = $1
           AND rs.due_date = CURRENT_DATE
           AND rs.due_status NOT IN ('paid', 'waived', 'superseded')`,
        [tenantId]
      ),

      db.query(
        `SELECT COALESCE(SUM(rs.total_due - (rs.principal_paid + rs.markup_paid + rs.penalty_paid)), 0) AS total
         FROM repayment_schedules rs
         WHERE rs.company_id = $1
           AND rs.due_date < CURRENT_DATE
           AND rs.due_status NOT IN ('paid', 'waived', 'superseded')`,
        [tenantId]
      ),

      db.query(
        `SELECT COUNT(*) AS count
         FROM credit_accounts
         WHERE company_id = $1 AND status = 'active'`,
        [tenantId]
      ),

      // Covers all three dashboard filter tabs (Overdue / Due today /
      // Upcoming) in one query — due_bucket is computed here, server-side,
      // rather than by comparing dates in the browser (which would be
      // comparing against the viewer's clock, not the system of record's).
      db.query(
        `SELECT
           rs.credit_account_id,
           ca.account_number,
           rs.due_date,
           rs.total_due,
           (rs.principal_paid + rs.markup_paid + rs.penalty_paid) AS total_paid,
           COALESCE(NULLIF(TRIM(c.company_name), ''),
                    TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS customer_name,
           CASE
             WHEN rs.due_date < CURRENT_DATE THEN 'overdue'
             WHEN rs.due_date = CURRENT_DATE THEN 'due_today'
             ELSE 'upcoming'
           END AS due_bucket
         FROM repayment_schedules rs
         JOIN credit_accounts ca ON ca.id = rs.credit_account_id
         JOIN customers c ON c.id = ca.customer_id
         WHERE rs.company_id = $1
           AND rs.due_date <= (CURRENT_DATE + INTERVAL '30 days')::date
           AND rs.due_status NOT IN ('paid', 'waived', 'superseded')
         ORDER BY rs.due_date ASC
         LIMIT 50`,
        [tenantId]
      ),

      db.query(
        `SELECT payment_number, amount, payment_date
         FROM payments
         WHERE company_id = $1 AND status = 'posted'
         ORDER BY created_at DESC
         LIMIT 5`,
        [tenantId]
      ),
    ]);

  return {
    totalOutstanding: Number(totals.rows[0].total),
    dueToday: Number(dueToday.rows[0].total),
    overdueAmount: Number(overdueAmount.rows[0].total),
    activeAccounts: Number(activeCount.rows[0].count),
    needsAttention: needsAttention.rows,
    recentPayments: recentPayments.rows,
  };
};

module.exports = { getDashboardSummary };
