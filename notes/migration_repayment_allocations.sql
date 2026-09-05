-- Run this against your Postgres database.
-- payment_allocations could previously only point at a documents row
-- (document_id, NOT NULL) — there was no way to allocate a payment
-- against a specific repayment_schedules installment. This adds that,
-- and constrains the table to point at exactly one of the two, the same
-- exactly-one-of-N pattern already used by ledger_entries.
--
-- Confirmed before writing this: all 13 existing payment_allocations rows
-- have document_id set and no repayment_schedule_id (that column doesn't
-- exist yet), so they satisfy the new CHECK below without any data fix.

ALTER TABLE payment_allocations
  ALTER COLUMN document_id DROP NOT NULL;

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS repayment_schedule_id INTEGER REFERENCES repayment_schedules(id);

-- No existing CHECK governed this table at all before now (only NOT NULL/
-- FK/PK constraints) — adding one rather than leaving it unconstrained.
ALTER TABLE payment_allocations
  DROP CONSTRAINT IF EXISTS chk_payment_allocations_target;
ALTER TABLE payment_allocations
  ADD CONSTRAINT chk_payment_allocations_target CHECK (
    (document_id IS NOT NULL AND repayment_schedule_id IS NULL) OR
    (document_id IS NULL AND repayment_schedule_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_payment_allocations_repayment_schedule_id ON payment_allocations(repayment_schedule_id);
