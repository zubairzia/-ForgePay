-- Bootstrap: the base `customers` table.
--
-- This table predates every other tracked migration in notes/ — it was
-- created directly against Postgres, never captured in version control.
-- migration_tenant_and_constraints.sql's own header says as much
-- ("this assumes `customers` already exists"), and migration_customers_extend.sql
-- says it outright: "there was never a notes/migration_customers.sql; this
-- table only ever existed as whatever's live in Postgres."
--
-- Reconstructed here by introspecting the live table and then working
-- backwards through every later migration that touches `customers`
-- (migration_customers_extend.sql, migration_customers_lending_fields.sql,
-- migration_customer_mandatory_fields.sql) to reverse their effects:
--   - id was NOT part of the base table — migration_customers_extend.sql
--     adds it as a SERIAL PRIMARY KEY. This table has no primary key.
--   - last_name/email/billing_country/currency are nullable here —
--     migration_customer_mandatory_fields.sql is what makes them NOT NULL,
--     several migrations later.
--   - payment_terms_days, preferred_language, cr_number,
--     vat_registration_number, and every KYC/credit-risk/financial/
--     operational field (national_id, kyc_status, is_blacklisted,
--     opening_balance, metadata, etc.) do NOT exist yet — they're added by
--     migration_customers_extend.sql and migration_customers_lending_fields.sql
--     respectively, which both run after this file. Including them here
--     would double them up.
--   - tax_number, tax_id, balance, and is_deleted DO exist here — they
--     were dropped by migration_customers_lending_fields.sql, which
--     confirmed at the time that all four were genuinely unused (never
--     read or written anywhere in the codebase). Because no application
--     code ever referenced tax_number/tax_id, their TEXT type is inferred
--     from vendors.tax_number/tax_id (migration_vendors.sql), which mirrors
--     this table's shape; balance/is_deleted have no code trace at all to
--     confirm a type against, so NUMERIC(14,2) and BOOLEAN are a reasonable
--     reconstruction, not a verified one. It doesn't matter for anyone
--     running the migrations in order: migration_customers_lending_fields.sql
--     drops all four again a few files later, so the final schema is
--     identical either way.
--
-- Run this FIRST, before migration_tenant_and_constraints.sql.

CREATE TABLE customers (
  company_id            INTEGER NOT NULL,
  first_name            VARCHAR(100),
  last_name             VARCHAR(100),
  company_name          VARCHAR(150),
  email                 VARCHAR(50),
  phone                 VARCHAR(50),
  website               VARCHAR(150),
  billing_street        TEXT,
  billing_city          VARCHAR(100),
  billing_state         VARCHAR(100),
  billing_postal_code   VARCHAR(20),
  shipping_street       TEXT,
  shipping_city         VARCHAR(100),
  shipping_state        VARCHAR(100),
  shipping_postal_code  VARCHAR(20),
  shipping_country      VARCHAR(100),
  billing_country       VARCHAR(100),
  credit_limit          NUMERIC DEFAULT 0,
  currency              VARCHAR(10),
  is_taxable            BOOLEAN DEFAULT true,
  status                VARCHAR DEFAULT 'Active',
  customer_type         VARCHAR(20),
  source                VARCHAR(100),
  notes                 TEXT,
  tags                  TEXT,
  created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  customer_code         VARCHAR(20),
  display_name          VARCHAR(150),
  mobile                VARCHAR(150),
  -- Dropped later by migration_customers_lending_fields.sql — see note above.
  tax_number            TEXT,
  tax_id                TEXT,
  balance               NUMERIC(14,2) DEFAULT 0,
  is_deleted            BOOLEAN NOT NULL DEFAULT false
);

-- customer_code generation. This trigger/function/sequence already existed
-- live before any tracked migration — migration_customers_extend.sql
-- redeclares them idempotently (CREATE OR REPLACE / IF NOT EXISTS / DROP
-- IF EXISTS+CREATE) for exactly this reason: a fresh database that only
-- had that file, without this one, would silently generate NULL
-- customer_codes for every new customer.
--
-- START WITH 100000 to match the live sequence's actual current
-- configuration — a fresh install that started at 1 would produce
-- CUST-00000001-style codes, visibly different from the CUST-00100000+
-- codes every existing customer already has.
CREATE SEQUENCE customer_code_seq START WITH 100000;

CREATE OR REPLACE FUNCTION generate_customer_code()
RETURNS trigger AS $$
BEGIN
  NEW.customer_code := 'CUST-' || LPAD(nextval('customer_code_seq')::text, 8, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_code_trigger
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION generate_customer_code();
