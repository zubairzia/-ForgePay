-- Customers module: mandatory fields + conditional business validation.
--
-- Findings before this migration (checked 2026-09-06):
--   - 16 total customers.
--   - id 15 (CUST-00100011, "Repay TestCustomer") is the only row with
--     NULL billing_country/currency/customer_type. Backfilled to SA/SAR
--     per explicit decision (it is a smoke-test account).
--   - last_name and email have zero NULLs across all rows already.
--   - All 14 existing 'Business'-type customers are missing both
--     vat_registration_number and cr_number. The conditional CHECK below
--     is added NOT VALID so these existing rows are grandfathered in
--     un-touched, while every future insert/update is enforced.
--   - customer_type stores 'Business'/'Individual' (capitalized), no
--     format constraint existed. Normalized to lowercase to match the
--     app-layer canonical values in constants/customerTypes.js.

BEGIN;

-- 1. One-time data fixes (explicit, not a blanket backfill).
UPDATE customers
SET billing_country = 'SA', currency = 'SAR'
WHERE id = 15;

UPDATE customers
SET customer_type = lower(customer_type)
WHERE customer_type IS NOT NULL AND customer_type <> lower(customer_type);

-- 2. Unconditional mandatory fields.
ALTER TABLE customers ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE customers ALTER COLUMN email SET NOT NULL;
ALTER TABLE customers ALTER COLUMN billing_country SET NOT NULL;
ALTER TABLE customers ALTER COLUMN currency SET NOT NULL;

-- 3. customer_type format (nullable still -- not asked to be mandatory,
--    only to be constrained to the two canonical values when present).
ALTER TABLE customers ADD CONSTRAINT customers_customer_type_check
  CHECK (customer_type IS NULL OR customer_type IN ('individual', 'business'));

-- 4. Conditional: business customers must carry VAT + CR. NOT VALID
--    grandfathers the 14 existing business rows that predate this rule;
--    every future insert/update is still checked.
ALTER TABLE customers ADD CONSTRAINT customers_business_vat_cr_check
  CHECK (
    customer_type IS DISTINCT FROM 'business'
    OR (
      vat_registration_number IS NOT NULL AND btrim(vat_registration_number) <> ''
      AND cr_number IS NOT NULL AND btrim(cr_number) <> ''
    )
  ) NOT VALID;

COMMIT;
