-- Run this against your Postgres database.
-- Unified document pattern: one documents header table + document_lines,
-- instead of separate near-duplicate tables per document type (quote,
-- sales order, invoice, purchase order, bill, credit note).
--
-- DEPENDENCIES — must exist before this file runs:
--   - companies            (exists)
--   - customers, with an id PK (see migration_customers_extend.sql)
--   - vendors               *** DOES NOT EXIST IN THE LIVE DATABASE YET ***
--                            migration_vendors.sql was written but was
--                            never actually run. It must run before this
--                            file, or the vendor_id FK below will fail.
--   - a `users` table for documents.created_by — DOES NOT EXIST ANYWHERE
--     yet (no auth system built). See note on created_by below for how
--     this file handles that.

CREATE TABLE IF NOT EXISTS documents (
  id                   SERIAL PRIMARY KEY,
  company_id           INTEGER NOT NULL REFERENCES companies(id),
  document_type        TEXT NOT NULL CHECK (document_type IN (
                          'quote', 'sales_order', 'invoice',
                          'purchase_order', 'bill', 'credit_note'
                        )),
  direction            TEXT NOT NULL CHECK (direction IN ('sales', 'purchase')),
  document_number      TEXT NOT NULL,
  customer_id          INTEGER REFERENCES customers(id),
  vendor_id            INTEGER REFERENCES vendors(id),
  related_document_id  INTEGER REFERENCES documents(id),
  issue_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date             DATE,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                          'draft', 'sent', 'confirmed', 'paid',
                          'partially_paid', 'overdue', 'cancelled'
                        )),
  currency             TEXT,
  subtotal             NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference_number     TEXT,
  notes                TEXT,
  terms                TEXT,
  -- NOTE: spec calls for `created_by FK users(id)`, but no `users` table
  -- exists anywhere in this codebase yet (no auth built). A real FK
  -- constraint against a nonexistent table would make this migration fail
  -- to run at all. Left as a plain nullable column for now — add the FK
  -- constraint in a follow-up migration once a users table exists:
  --   ALTER TABLE documents ADD CONSTRAINT fk_documents_created_by
  --     FOREIGN KEY (created_by) REFERENCES users(id);
  created_by           INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_documents_party CHECK (
    (direction = 'sales' AND customer_id IS NOT NULL) OR
    (direction = 'purchase' AND vendor_id IS NOT NULL)
  )
);

-- document_number unique per tenant + document type, not globally.
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_company_type_number
  ON documents(company_id, document_type, document_number);

CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
-- Not explicitly requested, but customer_id/vendor_id will obviously be
-- filtered on constantly too (e.g. "all invoices for customer X").
CREATE INDEX IF NOT EXISTS idx_documents_customer_id ON documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_vendor_id ON documents(vendor_id);

CREATE TABLE IF NOT EXISTS document_lines (
  id                SERIAL PRIMARY KEY,
  -- Spec's field list for document_lines didn't list company_id, but the
  -- brief's closing "every table needs company_id..." reads as a blanket
  -- rule for all new tables, including line/child tables — included here
  -- for that reason. Flag if that's not what you intended; it's easy to
  -- drop before Step 3.
  company_id        INTEGER NOT NULL REFERENCES companies(id),
  document_id       INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  item_id           INTEGER REFERENCES items(id),
  description       TEXT,
  quantity          NUMERIC(14,4) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(14,4) NOT NULL DEFAULT 0,
  discount_percent  NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_lines_company_id ON document_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_document_lines_document_id ON document_lines(document_id);

-- Per-tenant, per-document-type sequential numbering. Deliberately just a
-- counter table — the safe-increment logic (SELECT ... FOR UPDATE inside
-- the same transaction as the document INSERT) belongs in the future
-- documents localService, not in DDL. Mirrors the fix already applied to
-- the duplicate-email race condition in createLocalCustomer:
--
--   BEGIN;
--   SELECT last_number FROM document_number_sequences
--     WHERE company_id = $1 AND document_type = $2 FOR UPDATE;
--   -- no row yet: INSERT INTO document_number_sequences
--   --   (company_id, document_type, last_number) VALUES ($1, $2, 1);
--   -- row exists: UPDATE document_number_sequences
--   --   SET last_number = last_number + 1, updated_at = now()
--   --   WHERE company_id = $1 AND document_type = $2;
--   -- use the resulting last_number to build document_number, then
--   -- INSERT the document itself, then COMMIT.
CREATE TABLE IF NOT EXISTS document_number_sequences (
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  document_type   TEXT NOT NULL,
  last_number     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, document_type)
);
-- No separate company_id index needed: it's the leading column of the
-- primary key, so it's already indexed.
