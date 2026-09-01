-- Vendors table, mirroring the customers table shape.
-- Run after migration_tenant_and_constraints.sql (needs the companies table).

CREATE TABLE IF NOT EXISTS vendors (
  id                    SERIAL PRIMARY KEY,
  vendor_code           TEXT UNIQUE NOT NULL DEFAULT ('VEND-' || nextval('vendors_id_seq')::text),
  company_id            INTEGER NOT NULL REFERENCES companies(id),
  first_name            TEXT,
  last_name             TEXT,
  company_name          TEXT,
  display_name          TEXT,
  email                 TEXT,
  phone                 TEXT,
  mobile                TEXT,
  website               TEXT,
  billing_street        TEXT,
  billing_city          TEXT,
  billing_state         TEXT,
  billing_postal_code   TEXT,
  billing_country       TEXT,
  tax_number            TEXT,
  tax_id                TEXT,
  currency              TEXT,
  is_taxable            BOOLEAN DEFAULT true,
  status                TEXT DEFAULT 'active',
  source                TEXT,
  notes                 TEXT,
  tags                  TEXT[],
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company_id ON vendors(company_id);
ALTER TABLE vendors ADD CONSTRAINT uq_vendors_company_email UNIQUE (company_id, email);
