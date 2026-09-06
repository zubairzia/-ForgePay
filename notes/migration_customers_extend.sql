-- Run this against your Postgres database.
-- Fixes structural gaps found reviewing services/Customers/localService.js
-- against the LIVE `customers` table — there was never a
-- notes/migration_customers.sql; this table only ever existed as
-- whatever's live in Postgres. Nothing here changes any
-- localService.js / controller / view code.

-- 1. Primary key. customers had NO id column and NO primary key at all —
--    every other tenant-scoped table (vendors, companies) has one, and
--    documents.customer_id (see migration_documents.sql) needs something
--    to reference. Adding a SERIAL column here backfills existing rows
--    with sequential ids automatically.
ALTER TABLE customers
  ADD COLUMN id SERIAL PRIMARY KEY;

-- 2. Tenant relationship + email uniqueness. These two statements already
--    exist in migration_tenant_and_constraints.sql but were apparently
--    never actually run against this database — there was no FK from
--    customers.company_id to companies, and no unique constraint on
--    (company_id, email). Included here so this one file brings customers
--    fully up to date without needing to also re-run the older file.
--    Guarded with existence checks (plain ADD CONSTRAINT has no
--    IF NOT EXISTS in Postgres) since a fresh database that runs
--    migration_tenant_and_constraints.sql first — the documented order in
--    README.md — already has both, and this would otherwise fail with
--    "constraint already exists" instead of being the harmless no-op it
--    was on the original database this migration was written against.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_company') THEN
    ALTER TABLE customers
      ADD CONSTRAINT fk_customers_company
      FOREIGN KEY (company_id) REFERENCES companies(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_customers_company_email') THEN
    ALTER TABLE customers
      ADD CONSTRAINT uq_customers_company_email UNIQUE (company_id, email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);

-- 3. Document the customer_code trigger. This exists live in Postgres but
--    was never captured in version control anywhere — a fresh database
--    built from this repo's migrations alone would silently generate NULL
--    customer_codes for every new customer (the exact bug already patched
--    around in the UI with the "No ID" badge). CREATE OR REPLACE /
--    DROP ... IF EXISTS make this a no-op against the current database and
--    a real fix on a fresh one.
CREATE SEQUENCE IF NOT EXISTS customer_code_seq;

CREATE OR REPLACE FUNCTION generate_customer_code()
RETURNS trigger AS $$
BEGIN
  NEW.customer_code := 'CUST-' || LPAD(nextval('customer_code_seq')::text, 8, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_code_trigger ON customers;
CREATE TRIGGER customer_code_trigger
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION generate_customer_code();

-- 4. New CRM/B2B fields (Step 1 findings).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS payment_terms_days     INTEGER,
  ADD COLUMN IF NOT EXISTS preferred_language     TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS cr_number              TEXT,
  ADD COLUMN IF NOT EXISTS vat_registration_number TEXT;

-- NOTE on payment_terms_days: a plain integer (e.g. 30 = "Net 30") rather
-- than a FK to a payment-terms table, since no such lookup table exists
-- yet. If terms need to become a named, reusable catalog later (e.g.
-- "Net 30" vs "Due on Receipt" with different rules attached), this should
-- become a FK at that point instead of a raw day count.

-- NOTE on tax_number / tax_id: left untouched. They're redundant/unclear
-- as named, but renaming or dropping either would break the existing
-- localService.js / controller / views that read and write them — an
-- application-code change, out of scope for a schema-only pass.
-- vat_registration_number is added as the clearly-named field going
-- forward; consolidating the old two into it is a follow-up once the
-- Customers service is next touched.

-- NOTE on balance / is_deleted: left untouched, no schema change here.
--   - balance is written by nothing today. Once ledger_entries exists
--     (see migration_ledger.sql), this should likely become a derived
--     value (computed from ledger_entries) rather than a stored column
--     the app has to keep in sync — decide this when the ledger/payments
--     services are actually built, not here.
--   - is_deleted is written by nothing today and no read query filters on
--     it. Either wire up soft-delete everywhere it's needed, or drop the
--     column — deferred to when Customers services/controllers are next
--     touched, since both options require application-code changes.

-- 5. OPTIONAL data backfill: 3 legacy customers predate the customer_code
--    trigger and still have customer_code = NULL (the "No ID" badge case
--    already handled in the UI). Uncomment to assign them real codes —
--    left commented out since this is a data change, not a schema change,
--    and you may want to review these specific rows first.
-- UPDATE customers
--   SET customer_code = 'CUST-' || LPAD(nextval('customer_code_seq')::text, 8, '0')
--   WHERE customer_code IS NULL;
