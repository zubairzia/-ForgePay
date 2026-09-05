-- Run this against your Postgres database.
-- Double-entry-style ledger of every financial event, sourced from
-- documents, payments, or vendor_payments. Depends on: companies,
-- documents, payments, vendor_payments.
--
-- Uses three separate nullable FK columns (document_id, payment_id,
-- vendor_payment_id) instead of a polymorphic source_type/source_id pair,
-- so Postgres itself enforces referential integrity — this is the
-- financial system of record, so that isn't left to the application layer.
-- The CHECK constraint below ensures exactly one of the three is set,
-- matching source_type.

CREATE TABLE IF NOT EXISTS ledger_entries (
  id                 SERIAL PRIMARY KEY,
  company_id         INTEGER NOT NULL REFERENCES companies(id),
  source_type        TEXT NOT NULL CHECK (source_type IN ('document', 'payment', 'vendor_payment')),
  document_id        INTEGER REFERENCES documents(id),
  payment_id         INTEGER REFERENCES payments(id),
  vendor_payment_id  INTEGER REFERENCES vendor_payments(id),
  entry_type         TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  account            TEXT NOT NULL CHECK (account IN (
                        'accounts_receivable', 'accounts_payable', 'revenue', 'tax_payable'
                      )),
  amount             NUMERIC(14,2) NOT NULL,
  description        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_entries_source CHECK (
    (source_type = 'document'       AND document_id       IS NOT NULL AND payment_id IS NULL AND vendor_payment_id IS NULL) OR
    (source_type = 'payment'        AND payment_id        IS NOT NULL AND document_id IS NULL AND vendor_payment_id IS NULL) OR
    (source_type = 'vendor_payment' AND vendor_payment_id IS NOT NULL AND document_id IS NULL AND payment_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_company_id ON ledger_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_document_id ON ledger_entries(document_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_payment_id ON ledger_entries(payment_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_vendor_payment_id ON ledger_entries(vendor_payment_id);
