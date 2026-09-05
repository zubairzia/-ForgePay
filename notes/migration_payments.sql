-- Run this against your Postgres database.
-- Customer payments and how they're allocated against documents (invoices,
-- primarily). Depends on: companies, customers (with id PK — see
-- migration_customers_extend.sql), documents (see migration_documents.sql).

CREATE TABLE IF NOT EXISTS payments (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id),
  customer_id       INTEGER NOT NULL REFERENCES customers(id),
  payment_number    TEXT NOT NULL,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  amount            NUMERIC(14,2) NOT NULL,
  payment_method    TEXT,
  reference_number  TEXT,
  status            TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed', 'refunded')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payment_number unique per tenant, not globally. Same
-- SELECT ... FOR UPDATE sequencing approach as document_number_sequences
-- applies here too if/when payment numbering needs to be sequential.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_company_number ON payments(company_id, payment_number);
CREATE INDEX IF NOT EXISTS idx_payments_company_id ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id                SERIAL PRIMARY KEY,
  -- See the same note in migration_documents.sql re: company_id on child
  -- tables — added here for consistency with the blanket rule, even
  -- though the spec's field list for this table didn't list it.
  company_id        INTEGER NOT NULL REFERENCES companies(id),
  payment_id        INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  document_id       INTEGER NOT NULL REFERENCES documents(id),
  allocated_amount  NUMERIC(14,2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_company_id ON payment_allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_document_id ON payment_allocations(document_id);
