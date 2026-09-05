-- Run this against your Postgres database.
-- Items catalog — goods and services referenced by document_lines rows
-- (see migration_documents.sql) across quotes, sales orders, invoices,
-- purchase orders, and bills.

CREATE TABLE IF NOT EXISTS items (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  item_code       TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  item_type       TEXT NOT NULL DEFAULT 'goods' CHECK (item_type IN ('goods', 'service')),
  sku             TEXT,
  unit_of_measure TEXT,
  sales_price     NUMERIC(14,2),
  purchase_price  NUMERIC(14,2),
  tax_rate        NUMERIC(5,2),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- item_code unique per tenant, not globally.
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_company_item_code ON items(company_id, item_code);
CREATE INDEX IF NOT EXISTS idx_items_company_id ON items(company_id);
