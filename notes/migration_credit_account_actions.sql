-- Run this against your Postgres database.
-- Schema for the four credit-account detail-page actions: Waive Penalty,
-- Reschedule, Send Reminder, Download Statement.

BEGIN;

-- ============================================================
-- Reschedule needs a way to mark an installment as superseded without
-- deleting or overwriting it -- see the design note in
-- services/CreditAccounts/localService.js's rescheduleAccount for why
-- this is a due_status value rather than a version-number filter: every
-- existing and future query that already filters to "open" statuses
-- (e.g. WHERE due_status NOT IN ('paid','waived')) needs no changes to
-- stay correct, since 'superseded' just isn't in that allow-list. Queries
-- that recompute outstanding_* from ALL rows (recordRepayment,
-- dailyStatusUpdate) DO need an explicit exclusion, since a superseded
-- row's due/paid gap would otherwise double-count against its
-- replacement rows -- fixed in this same change, not left as a trap.
-- ============================================================
ALTER TABLE repayment_schedules
  DROP CONSTRAINT IF EXISTS repayment_schedules_due_status_check;
ALTER TABLE repayment_schedules
  ADD CONSTRAINT repayment_schedules_due_status_check
  CHECK (due_status IN ('upcoming', 'due', 'partial', 'paid', 'overdue', 'waived', 'superseded'));

-- ============================================================
-- notifications -- the engine for "Send Reminder" (and future automated
-- reminders). Tenant-scoped, unlike job_runs: a notification is always
-- about one company's customer.
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  credit_account_id   INTEGER REFERENCES credit_accounts(id),
  customer_id         INTEGER NOT NULL REFERENCES customers(id),
  channel             TEXT NOT NULL,
  recipient           TEXT NOT NULL,
  template_key        TEXT NOT NULL,
  body                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  sent_at             TIMESTAMPTZ,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No users table dependency issue here (unlike documents.created_by
  -- when it was first added) -- users already exists.
  created_by          INTEGER REFERENCES users(id)
);

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_channel_check
  CHECK (channel IN ('sms', 'whatsapp', 'email'));

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('pending', 'sent', 'failed'));

CREATE INDEX IF NOT EXISTS idx_notifications_company_id ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_credit_account_id ON notifications(credit_account_id);

COMMIT;
