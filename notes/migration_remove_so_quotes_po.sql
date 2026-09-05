-- Run this against your Postgres database.
-- ForgePay's product direction narrowed to an installment lending platform
-- with invoicing underneath it, not a general CRM/ERP — Quotes, Sales
-- Orders, and Purchase Orders are removed entirely. This tightens the
-- documents.document_type CHECK constraint to only the three types that
-- remain.
--
-- Safe to run: confirmed zero rows exist in documents or
-- document_number_sequences with document_type IN ('quote', 'sales_order',
-- 'purchase_order') before writing this migration. If that's no longer
-- true when you run this, the ALTER TABLE below will fail loudly (a CHECK
-- constraint addition validates all existing rows) rather than silently
-- orphaning data — do not delete rows to force it through without
-- reviewing them first.

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN ('invoice', 'bill', 'credit_note'));
