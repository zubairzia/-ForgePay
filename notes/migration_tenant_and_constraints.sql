-- Run this against your Postgres database. Review before running in production —
-- this assumes `customers` already exists and currently has no company_id FK.

-- 1. A real tenants table. Everything in the app currently assumes
--    company_id = 1; this makes "company_id" a real, enforced concept.
CREATE TABLE IF NOT EXISTS companies (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill: if you already have rows with company_id = 1, make sure a
-- matching row exists here so the FK below doesn't fail.
INSERT INTO companies (id, name)
VALUES (1, 'Default company (backfilled)')
ON CONFLICT (id) DO NOTHING;

-- 2. Enforce the relationship at the DB level instead of trusting app code.
ALTER TABLE customers
  ADD CONSTRAINT fk_customers_company
  FOREIGN KEY (company_id) REFERENCES companies(id);

-- 3. Close the race condition in createLocalCustomer: two concurrent
--    requests with the same email can both pass the app-level duplicate
--    check before either INSERT commits. A unique constraint makes the
--    second one fail loudly and atomically instead of creating a
--    duplicate. Scoped per-tenant, since two different tenants are
--    allowed to have customers with the same email.
ALTER TABLE customers
  ADD CONSTRAINT uq_customers_company_email UNIQUE (company_id, email);

-- After adding this constraint, catch Postgres error code 23505
-- (unique_violation) in localService.js as a belt-and-suspenders check
-- alongside the existing app-level SELECT.

-- 4. Every tenant-scoped table going forward needs the same shape:
--    company_id NOT NULL REFERENCES companies(id), plus an index,
--    since every query will filter on it.
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);
