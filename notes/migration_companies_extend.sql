-- Run this against your Postgres database.
-- Extends the tenants table created in notes/migration_tenant_and_constraints.sql
-- (id, name, created_at) with the fields the Companies module needs.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS legal_name         TEXT,
  ADD COLUMN IF NOT EXISTS industry           TEXT,
  ADD COLUMN IF NOT EXISTS country            TEXT,
  ADD COLUMN IF NOT EXISTS currency           TEXT,
  ADD COLUMN IF NOT EXISTS timezone           TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan  TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

-- Fix: migration_tenant_and_constraints.sql inserted the default company
-- with an explicit id=1, which never advances companies_id_seq. Left as-is,
-- the next createCompany() call collides on the primary key. Resync the
-- sequence to the current max id so new inserts get the next free one.
SELECT setval('companies_id_seq', COALESCE((SELECT MAX(id) FROM companies), 1));
