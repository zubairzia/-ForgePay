-- Run this against your Postgres database.
-- Credit/lending schema for ForgePay's installment lending platform.
-- Depends on: companies, customers (id PK), vendors, documents.
-- Schema only — no application code in this migration.

-- ============================================================
-- credit_accounts — one row per installment credit sale/loan.
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_accounts (
  id                      SERIAL PRIMARY KEY,
  company_id              INTEGER NOT NULL REFERENCES companies(id),
  account_number          TEXT NOT NULL,
  customer_id             INTEGER NOT NULL REFERENCES customers(id),
  vendor_id               INTEGER REFERENCES vendors(id),
  source_document_id      INTEGER REFERENCES documents(id),

  principal_amount        NUMERIC(14,2) NOT NULL,
  down_payment_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Fixed, disclosed at origination — deliberately NOT an interest rate.
  -- No annual_interest_rate column: ForgePay prices credit as a flat,
  -- upfront markup amount, not an accruing rate.
  markup_amount           NUMERIC(14,2) NOT NULL,
  financed_amount         NUMERIC(14,2) NOT NULL,
  total_payable_amount    NUMERIC(14,2) NOT NULL,

  installment_type        TEXT NOT NULL CHECK (installment_type IN ('one_time', 'recurring')),
  installment_frequency   TEXT CHECK (installment_frequency IN ('weekly', 'biweekly', 'monthly', 'yearly')),
  installment_count       INTEGER NOT NULL DEFAULT 1,

  start_date              DATE NOT NULL,
  maturity_date           DATE NOT NULL,

  status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft', 'active', 'closed', 'overdue', 'defaulted', 'cancelled'
                          )),

  outstanding_principal   NUMERIC(14,2) NOT NULL,
  outstanding_markup      NUMERIC(14,2) NOT NULL,
  outstanding_penalty     NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- No users table yet (no auth built) — same pattern as documents.created_by.
  created_by              INTEGER,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_credit_accounts_installment CHECK (
    (installment_type <> 'recurring' OR installment_frequency IS NOT NULL) AND
    (installment_type <> 'one_time'  OR installment_count = 1)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_accounts_company_number ON credit_accounts(company_id, account_number);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_company_id ON credit_accounts(company_id);
-- Not explicitly requested, but customer_id/vendor_id/status will
-- obviously be filtered on constantly (e.g. "this customer's accounts",
-- "all overdue accounts") — same reasoning applied to documents earlier.
CREATE INDEX IF NOT EXISTS idx_credit_accounts_customer_id ON credit_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_vendor_id ON credit_accounts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_status ON credit_accounts(status);

-- ============================================================
-- repayment_schedules — the installment plan for a credit_account.
-- ============================================================
CREATE TABLE IF NOT EXISTS repayment_schedules (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  credit_account_id   INTEGER NOT NULL REFERENCES credit_accounts(id),
  installment_number  INTEGER NOT NULL,
  due_date            DATE NOT NULL,

  principal_due       NUMERIC(14,2) NOT NULL,
  markup_due          NUMERIC(14,2) NOT NULL,
  penalty_due         NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_due           NUMERIC(14,2) NOT NULL,

  principal_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,
  markup_paid         NUMERIC(14,2) NOT NULL DEFAULT 0,
  penalty_paid        NUMERIC(14,2) NOT NULL DEFAULT 0,

  due_status          TEXT NOT NULL DEFAULT 'upcoming' CHECK (due_status IN (
                        'upcoming', 'due', 'partial', 'paid', 'overdue', 'waived'
                      )),
  paid_at             TIMESTAMPTZ,
  -- Optimistic-concurrency counter for whoever builds the payment-
  -- allocation logic against this table later (bumped on every update).
  version             INTEGER NOT NULL DEFAULT 1,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_repayment_schedules_account_installment UNIQUE (credit_account_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_repayment_schedules_company_id ON repayment_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_credit_account_id ON repayment_schedules(credit_account_id);
-- Not explicitly requested, but due_date/due_status are exactly what a
-- "what's due/overdue today" query filters on.
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_due_date ON repayment_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_due_status ON repayment_schedules(due_status);

-- ============================================================
-- credit_account_events — append-only audit trail. No updated_at:
-- events are immutable by nature, unlike every other table here.
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_account_events (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  credit_account_id   INTEGER NOT NULL REFERENCES credit_accounts(id),
  event_type          TEXT NOT NULL,
  event_data          JSONB,
  -- No users table yet — same pattern as credit_accounts.created_by.
  performed_by        INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_account_events_company_id ON credit_account_events(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_account_events_credit_account_id ON credit_account_events(credit_account_id);

-- ============================================================
-- vendor_fee_transactions — fees charged to a vendor against a specific
-- credit_account (e.g. a merchant discount fee). No updated_at, matching
-- the spec's field list exactly — a transaction record, not a mutable
-- entity; a status change (pending -> collected/waived) is itself the kind
-- of event credit_account_events-style logging would capture separately.
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_fee_transactions (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  vendor_id           INTEGER NOT NULL REFERENCES vendors(id),
  credit_account_id   INTEGER NOT NULL REFERENCES credit_accounts(id),
  fee_type            TEXT,
  fee_rate            NUMERIC(5,2),
  fee_amount          NUMERIC(14,2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'waived')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_fee_transactions_company_id ON vendor_fee_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_vendor_fee_transactions_vendor_id ON vendor_fee_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_fee_transactions_credit_account_id ON vendor_fee_transactions(credit_account_id);

-- ============================================================
-- ledger_entries — add credit_account_id as a fourth possible source,
-- alongside the existing document_id/payment_id/vendor_payment_id
-- columns. Same real-FK-over-polymorphic-reference approach as before.
-- ============================================================
ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS credit_account_id INTEGER REFERENCES credit_accounts(id);

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_source_type_check
  CHECK (source_type IN ('document', 'payment', 'vendor_payment', 'credit_account'));

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS chk_ledger_entries_source;
ALTER TABLE ledger_entries
  ADD CONSTRAINT chk_ledger_entries_source CHECK (
    (source_type = 'document'       AND document_id       IS NOT NULL AND payment_id IS NULL AND vendor_payment_id IS NULL AND credit_account_id IS NULL) OR
    (source_type = 'payment'        AND payment_id        IS NOT NULL AND document_id IS NULL AND vendor_payment_id IS NULL AND credit_account_id IS NULL) OR
    (source_type = 'vendor_payment' AND vendor_payment_id IS NOT NULL AND document_id IS NULL AND payment_id IS NULL AND credit_account_id IS NULL) OR
    (source_type = 'credit_account' AND credit_account_id IS NOT NULL AND document_id IS NULL AND payment_id IS NULL AND vendor_payment_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_ledger_entries_credit_account_id ON ledger_entries(credit_account_id);
