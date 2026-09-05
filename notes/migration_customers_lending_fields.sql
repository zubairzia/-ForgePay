-- Run this against your Postgres database.
-- Completes the Customers module for ForgePay's actual product: an
-- installment lending platform, not a general CRM. Adds KYC and
-- credit-risk fields a lender needs that a generic CRM never did, and
-- resolves two things flagged in an earlier audit but never actioned.
--
-- Confirmed before writing this:
--   - payment_terms_days already exists (added in migration_customers_extend.sql).
--   - cr_number, vat_registration_number, preferred_language already exist
--     but are wired into NOTHING (not on any form, not in create/update) —
--     Phase 3 (application code) connects vat_registration_number and
--     cr_number for real; this migration doesn't need to touch them.
--   - No index references tax_number, tax_id, balance, or is_deleted, so
--     dropping them below doesn't require dropping anything else first.

-- ============================================================
-- Identity / KYC
-- ============================================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS national_id      TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth    DATE,
  ADD COLUMN IF NOT EXISTS secondary_phone  TEXT,
  ADD COLUMN IF NOT EXISTS kyc_status       TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_verified_at  TIMESTAMPTZ;

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_kyc_status_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_kyc_status_check
  CHECK (kyc_status IN ('pending', 'verified', 'rejected'));

-- ============================================================
-- Credit risk
-- ============================================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS risk_rating             TEXT,
  ADD COLUMN IF NOT EXISTS credit_score             INTEGER,
  ADD COLUMN IF NOT EXISTS is_blacklisted            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blacklist_reason          TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_name            TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_phone           TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_national_id     TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_relationship    TEXT;

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_risk_rating_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_risk_rating_check
  CHECK (risk_rating IS NULL OR risk_rating IN ('low', 'medium', 'high'));

-- ============================================================
-- Financial defaults
-- ============================================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS preferred_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS opening_balance           NUMERIC(14,2) NOT NULL DEFAULT 0;
-- payment_terms_days already exists — confirmed above, nothing to add.

-- ============================================================
-- Operational
-- ============================================================
ALTER TABLE customers
  -- No users table yet (no auth built). Same pattern as
  -- documents.created_by / credit_accounts.created_by — add the FK once
  -- users exists:
  --   ALTER TABLE customers ADD CONSTRAINT fk_customers_assigned_agent
  --     FOREIGN KEY (assigned_agent_id) REFERENCES users(id);
  ADD COLUMN IF NOT EXISTS assigned_agent_id INTEGER,
  ADD COLUMN IF NOT EXISTS customer_since    DATE,
  -- Flexible extras (KYC document references, custom fields, integration
  -- payloads) — typed columns for money/dates/status above, JSONB here for
  -- everything that doesn't deserve its own column yet.
  ADD COLUMN IF NOT EXISTS metadata          JSONB;

-- ============================================================
-- Resolve tax_number/tax_id vs vat_registration_number/cr_number:
-- confirmed tax_number/tax_id are the only ones actually wired into
-- services/Customers/localService.js today; vat_registration_number/
-- cr_number were added earlier but never connected to anything. Per your
-- decision: drop the old pair, Phase 3 wires up the new pair for real.
-- ============================================================
ALTER TABLE customers
  DROP COLUMN IF EXISTS tax_number,
  DROP COLUMN IF EXISTS tax_id;

-- ============================================================
-- Resolve balance/is_deleted: confirmed neither is read or written
-- anywhere in the codebase. balance would only ever drift from the
-- ledger/credit_accounts source of truth; is_deleted has no delete flow.
-- Per your decision: drop both rather than build either out.
-- ============================================================
ALTER TABLE customers
  DROP COLUMN IF EXISTS balance,
  DROP COLUMN IF EXISTS is_deleted;

-- ============================================================
-- Indexes — both will be filtered on (blacklist checks at credit-account
-- creation time, national ID lookups for KYC/duplicate checks).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customers_national_id ON customers(national_id);
CREATE INDEX IF NOT EXISTS idx_customers_is_blacklisted ON customers(is_blacklisted);
