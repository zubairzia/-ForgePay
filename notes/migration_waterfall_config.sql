-- Run this against your Postgres database.
-- Makes the payment waterfall order (which bucket a repayment is applied
-- to first: penalty, markup, or principal) a per-tenant config value
-- instead of hardcoded in application code.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS payment_waterfall_order TEXT NOT NULL DEFAULT 'penalty_markup_principal';

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_payment_waterfall_order_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_payment_waterfall_order_check
  CHECK (payment_waterfall_order IN ('penalty_markup_principal', 'principal_markup_penalty'));
