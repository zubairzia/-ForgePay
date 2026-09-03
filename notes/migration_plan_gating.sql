-- Run this against your Postgres database.
-- Adds a subscription plan to each tenant so procurement-side modules
-- (Vendors, Bills, Expenses, Purchase Orders, Vendor Credits) can be
-- gated behind a Pro plan. See middleware/plan.middleware.js.

-- 1. Companies table (idempotent — matches migration_tenant_and_constraints.sql
--    in case that one hasn't been run yet either).
CREATE TABLE IF NOT EXISTS companies (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Plan column. Two tiers for now: 'free' and 'pro'.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_plan_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_plan_check CHECK (plan IN ('free', 'pro'));

-- 3. Backfill the dev/default tenant (company_id = 1, hardcoded everywhere
--    until real auth exists) so the app has a real row to check the plan
--    against. Defaults to 'free' so the gate is visible; flip to 'pro'
--    manually to test the unlocked state:
--      UPDATE companies SET plan = 'pro' WHERE id = 1;
INSERT INTO companies (id, name, plan)
VALUES (1, 'Default company (backfilled)', 'free')
ON CONFLICT (id) DO NOTHING;
