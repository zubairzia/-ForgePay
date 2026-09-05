-- Run this against your Postgres database.
-- Vendor (outbound) payments and how they're allocated against documents
-- (bills, primarily). Mirrors migration_payments.sql exactly, for the
-- purchase side. Depends on: companies, vendors (*** not yet created live
-- — see the dependency note in migration_documents.sql ***), documents.

CREATE TABLE IF NOT EXISTS vendor_payments (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id),
  vendor_id         INTEGER NOT NULL REFERENCES vendors(id),
  payment_number    TEXT NOT NULL,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  amount            NUMERIC(14,2) NOT NULL,
  payment_method    TEXT,
  reference_number  TEXT,
  status            TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_payments_company_number ON vendor_payments(company_id, payment_number);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_company_id ON vendor_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor_id ON vendor_payments(vendor_id);

CREATE TABLE IF NOT EXISTS vendor_payment_allocations (
  id                 SERIAL PRIMARY KEY,
  -- See the company_id-on-child-tables note in migration_documents.sql.
  company_id         INTEGER NOT NULL REFERENCES companies(id),
  vendor_payment_id  INTEGER NOT NULL REFERENCES vendor_payments(id) ON DELETE CASCADE,
  document_id        INTEGER NOT NULL REFERENCES documents(id),
  allocated_amount   NUMERIC(14,2) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_payment_allocations_company_id ON vendor_payment_allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_allocations_vendor_payment_id ON vendor_payment_allocations(vendor_payment_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_allocations_document_id ON vendor_payment_allocations(document_id);
