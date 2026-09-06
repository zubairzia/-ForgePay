-- Duplicate protection for customer identity fields that currently have
-- none: cr_number, vat_registration_number, national_id. Same gap as email
-- would have had without uq_customers_company_email -- the same business
-- or person can otherwise be registered twice, fragmenting their credit
-- exposure across duplicate records.
--
-- Checked for existing violations before writing this (2026-09-07): zero
-- duplicate (company_id, value) pairs found for any of the three fields
-- across all 16 existing customers, so no backfill/cleanup decision is
-- needed here.
--
-- Partial (WHERE ... IS NOT NULL) and per-company, matching the email
-- constraint's shape:
--   - Plain UNIQUE would treat multiple NULLs as distinct in Postgres
--     anyway, but the partial index makes that intent explicit and keeps
--     the index smaller (most individual customers have no cr_number/
--     vat_registration_number at all).
--   - Per-company because two different tenants may legitimately have the
--     same business or person as a customer.

BEGIN;

CREATE UNIQUE INDEX uq_customers_company_cr_number
  ON customers (company_id, cr_number) WHERE cr_number IS NOT NULL;

CREATE UNIQUE INDEX uq_customers_company_vat_number
  ON customers (company_id, vat_registration_number)
  WHERE vat_registration_number IS NOT NULL;

CREATE UNIQUE INDEX uq_customers_company_national_id
  ON customers (company_id, national_id) WHERE national_id IS NOT NULL;

COMMIT;
