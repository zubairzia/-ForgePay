-- Run this against your Postgres database.
-- Authentication and role-based access control: the users table, the
-- session table connect-pg-simple requires, and the FKs that have been
-- plain nullable integers waiting on this table to exist since the
-- columns were first added: documents.created_by,
-- credit_account_events.performed_by, customers.assigned_agent_id (all
-- three explicitly requested), plus credit_accounts.created_by -- same
-- "no users table yet" comment in notes/migration_credit_accounts.sql,
-- not explicitly called out but the identical pattern, wired up here too
-- rather than leaving one instance of it half-done.
--
-- Checked for existing values in all four columns before writing this
-- (2026-09-09):
--   - documents.created_by: zero non-null rows.
--   - credit_account_events.performed_by: zero non-null rows.
--   - credit_accounts.created_by: zero non-null rows.
--   - customers.assigned_agent_id: one non-null row (id=16,
--     CUST-00100012, "Fahad AlRashid", assigned_agent_id=7) -- an orphan
--     integer from before any users table existed. Per explicit decision,
--     nulled out below before adding the FK, since it has no real user to
--     point to and predates the concept of one.

BEGIN;

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  role            TEXT NOT NULL CHECK (role IN (
                    'owner', 'finance_manager', 'cashier', 'sales_agent', 'read_only'
                  )),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-tenant uniqueness, same pattern as uq_customers_company_email /
-- uq_vendors_company_email -- two different companies may independently
-- have a user with the same email (see services/Auth/localService.js's
-- login(), which tries every matching row across companies against the
-- supplied password rather than assuming email alone identifies a user).
CREATE UNIQUE INDEX uq_users_company_email ON users(company_id, email);
CREATE INDEX idx_users_company_id ON users(company_id);
-- login() looks up candidates by email alone (it doesn't know the company
-- yet), across every tenant -- this is the index that query needs.
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- session -- connect-pg-simple's own required schema, verbatim from
-- node_modules/connect-pg-simple/table.sql. Don't hand-roll this one.
-- ============================================================
CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");

-- ============================================================
-- Wire up the FKs that have been waiting on users to exist.
-- ============================================================
UPDATE customers SET assigned_agent_id = NULL WHERE assigned_agent_id = 7;

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_created_by FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE credit_account_events
  ADD CONSTRAINT fk_credit_account_events_performed_by FOREIGN KEY (performed_by) REFERENCES users(id);

ALTER TABLE customers
  ADD CONSTRAINT fk_customers_assigned_agent FOREIGN KEY (assigned_agent_id) REFERENCES users(id);

ALTER TABLE credit_accounts
  ADD CONSTRAINT fk_credit_accounts_created_by FOREIGN KEY (created_by) REFERENCES users(id);

COMMIT;
