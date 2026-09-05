-- Run this against your Postgres database.
-- Per-tenant sequential payment numbering, mirroring
-- document_number_sequences exactly. Fixes the same class of race
-- condition already fixed for customer emails (unique constraint +
-- app-level check) and document numbers (SELECT ... FOR UPDATE): the
-- COUNT(*)+1 scheme in services/Payments/localService.js and
-- services/VendorPayments/localService.js only had the
-- (company_id, payment_number) UNIQUE index as a backstop, with no
-- locking to prevent two concurrent requests from computing the same
-- count in the first place.

CREATE TABLE IF NOT EXISTS payment_number_sequences (
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  sequence_type   TEXT NOT NULL CHECK (sequence_type IN ('payment', 'vendor_payment')),
  last_number     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, sequence_type)
);
-- No separate company_id index needed: it's the leading column of the
-- primary key, so it's already indexed — same as document_number_sequences.

-- Confirmed already in place as a backstop (created as unique INDEXes in
-- migration_payments.sql / migration_vendor_payments.sql rather than named
-- constraints, but enforce uniqueness identically):
--   uq_payments_company_number        ON payments(company_id, payment_number)
--   uq_vendor_payments_company_number ON vendor_payments(company_id, payment_number)
-- No new constraint needed here.

-- Backfill: this table starts empty, but payments/vendor_payments may
-- already have rows from before this migration existed. Seed last_number
-- from the highest numeric suffix already in use per company, so the next
-- generated number continues after them instead of immediately colliding
-- with existing data on the UNIQUE index above. Safe to re-run — the
-- GREATEST() in the ON CONFLICT branch means running this twice (or after
-- more payments already exist) never moves last_number backwards.
INSERT INTO payment_number_sequences (company_id, sequence_type, last_number)
SELECT company_id, 'payment', MAX(SUBSTRING(payment_number FROM '\d+$')::int)
FROM payments
WHERE payment_number ~ '\d+$'
GROUP BY company_id
ON CONFLICT (company_id, sequence_type) DO UPDATE
  SET last_number = GREATEST(payment_number_sequences.last_number, EXCLUDED.last_number);

INSERT INTO payment_number_sequences (company_id, sequence_type, last_number)
SELECT company_id, 'vendor_payment', MAX(SUBSTRING(payment_number FROM '\d+$')::int)
FROM vendor_payments
WHERE payment_number ~ '\d+$'
GROUP BY company_id
ON CONFLICT (company_id, sequence_type) DO UPDATE
  SET last_number = GREATEST(payment_number_sequences.last_number, EXCLUDED.last_number);
