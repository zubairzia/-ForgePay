-- Run this against your Postgres database.
-- Scheduled jobs layer: per-company grace-period/late-fee configuration,
-- a job run log, and the one extra column the daily job's idempotency
-- guarantee depends on.

BEGIN;

-- ============================================================
-- Per-company grace period + late fee configuration.
-- ============================================================
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_fee_type      TEXT NOT NULL DEFAULT 'none',
  -- Dual-purpose: a flat currency amount when late_fee_type = 'fixed', or a
  -- percentage point (5.00 = 5%) when late_fee_type = 'percentage' --
  -- applied against that installment's own remaining unpaid balance, not
  -- its original amount.
  ADD COLUMN IF NOT EXISTS late_fee_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_fee_applies   TEXT NOT NULL DEFAULT 'once';

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_late_fee_type_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_late_fee_type_check
  CHECK (late_fee_type IN ('none', 'fixed', 'percentage'));

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_late_fee_applies_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_late_fee_applies_check
  CHECK (late_fee_applies IN ('once', 'daily', 'per_period'));

-- ============================================================
-- Idempotency guard for the daily job's late-fee step (see
-- services/Jobs/dailyStatusUpdate.js). Not part of the original field
-- list -- added because the job cannot safely decide "have I already
-- charged this installment for this cycle?" without it. Nullable: NULL
-- means "never charged."
-- ============================================================
ALTER TABLE repayment_schedules
  ADD COLUMN IF NOT EXISTS last_penalty_charged_date DATE;

-- ============================================================
-- job_runs -- deliberately NOT tenant-scoped (no company_id): a single
-- run processes every company, so one row represents the whole run, not
-- any one tenant's slice of it.
-- ============================================================
CREATE TABLE IF NOT EXISTS job_runs (
  id                  SERIAL PRIMARY KEY,
  job_name            TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'running',
  records_processed   INTEGER,
  error_message       TEXT
);

ALTER TABLE job_runs
  DROP CONSTRAINT IF EXISTS job_runs_status_check;
ALTER TABLE job_runs
  ADD CONSTRAINT job_runs_status_check
  CHECK (status IN ('running', 'success', 'failed'));

CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at);

COMMIT;
