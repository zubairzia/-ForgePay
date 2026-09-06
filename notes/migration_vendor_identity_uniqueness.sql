-- Duplicate protection for vendor identity fields, same gap and same fix
-- as notes/migration_customer_identity_uniqueness.sql: tax_number and
-- tax_id had no uniqueness protection at all (app or DB), so the same
-- vendor could be registered twice under the same tenant.
--
-- Checked for existing violations before writing this (2026-09-08): zero
-- duplicate (company_id, value) pairs found for tax_number, tax_id, or
-- email across all existing vendors, so no backfill/cleanup decision is
-- needed here.
--
-- Partial (WHERE ... IS NOT NULL) and per-company, matching
-- uq_vendors_company_email's shape: a plain UNIQUE index would already
-- treat multiple NULLs as distinct in Postgres, but the partial index
-- makes that intent explicit and keeps the index smaller; per-company
-- because two different tenants may legitimately share the same vendor.

BEGIN;

CREATE UNIQUE INDEX uq_vendors_company_tax_number
  ON vendors (company_id, tax_number) WHERE tax_number IS NOT NULL;

CREATE UNIQUE INDEX uq_vendors_company_tax_id
  ON vendors (company_id, tax_id) WHERE tax_id IS NOT NULL;

COMMIT;
