# ForgePay

A multi-tenant **installment lending platform** for GCC businesses selling goods and services on credit. A merchant originates a credit sale, ForgePay generates the repayment schedule, records repayments against it with configurable allocation, and tracks which accounts are overdue. Invoicing exists underneath this to support it — it is not the headline feature.

> **Status: early-stage, not production-ready.** Authentication does not exist yet — there is no login, no session, no `users` table. Every request resolves its tenant from a hardcoded placeholder (an `X-Tenant-Id` header on the API, a hardcoded `company_id = 1` on the web UI). Treat anything below as a description of what's built, not a claim that this is ready to run a real lending book.

## Why ForgePay

ForgePay prices credit as a **fixed, disclosed markup agreed at origination — not an interest rate.** There is no interest-rate column or interest-accrual logic anywhere in the schema; `credit_accounts.markup_amount` is a flat amount fixed at the time the account is opened, murabaha-style. This is a deliberate fit for GCC markets, not an oversight, and it's the one differentiator worth calling out explicitly: everywhere else in the codebase that might reflexively say "interest" instead says "markup."

## Tech stack

- **Backend:** Node.js, Express 5
- **Database:** PostgreSQL, raw parameterized SQL — no ORM
- **Views:** EJS, server-rendered
- **Styling:** Tailwind CSS

(Verified against `package.json`: `express ^5.2.1`, `pg ^8.20.0`, `ejs ^4.0.1`, `tailwindcss ^4.2.0`, `validator`, `dotenv`.)

## Current module status

| Module | Status |
|---|---|
| Dashboard | ✅ Working — live outstanding/due-today/overdue/active-account metrics, Overdue/Due-today/Upcoming filter tabs, deep links into the repayment and credit-account-detail flows |
| Companies | ✅ Working — full CRUD; the one resource reachable without a resolved tenant, since a company *is* the tenant |
| Customers | ✅ Working — full CRUD, KYC/credit-risk fields, mandatory-field and conditional business-field validation, country/currency dropdowns, duplicate protection on email/CR number/VAT number/national ID |
| Vendors | ✅ Working — full CRUD, duplicate protection on email/tax number/tax ID |
| Items | ✅ Working — full CRUD catalog (goods/services) referenced by document line items |
| Credit Accounts | ✅ Working — guided creation with a live schedule preview computed by the same server-side function used at save time; detail view with schedule, payments, and activity feed; status transitions. A few detail-page actions (waive penalty, reschedule, send reminder, download statement) are visibly present but intentionally disabled with a "coming soon" tooltip, not dead links |
| Repayments | ✅ Working — search by customer or account, an allocation preview computed by the same function used at posting time, per-company configurable waterfall order |
| Invoices | ✅ Working — full CRUD via the shared unified-document controller |
| Bills | ✅ Working — full CRUD via the shared unified-document controller |
| Credit Notes | ✅ Working — full CRUD via the shared unified-document controller, applicable against either a sales or a purchase document |
| Payments (customer payments against invoices) | 🚧 Partial — the service/API layer is real (recording and allocating payments against documents), but the web UI is a placeholder page with no form |
| Vendor Payments | 🚧 Partial — same as Payments, mirrored for the purchase side |
| Authentication | ❌ Not started — no `users` table, no login/session; tenant resolution is a hardcoded placeholder |

## Architecture notes

- **Unified document pattern.** Invoices, Bills, and Credit Notes are not three separate tables — they're all rows in one `documents` header table plus `document_lines`, parameterized by `document_type`, sharing one `services/Documents/localService.js` and one web controller factory (`createDocumentWebController`). Quotes, Sales Orders, and Purchase Orders used to exist in the same table and were removed outright when the product narrowed to lending; the `document_type` CHECK constraint now only allows `invoice` / `bill` / `credit_note`.
- **Credit accounts and repayment schedules are normalized rows, not JSON.** Each `repayment_schedules` row is one installment, independently queryable — "what's due today," "what's overdue," and per-installment principal/markup/penalty tracking are all plain SQL against real columns, not something parsed out of a blob.
- **Configurable payment waterfall.** Which bucket a repayment is applied to first — penalty, markup, or principal — is a per-tenant setting (`companies.payment_waterfall_order`), not hardcoded in application code.
- **Preview never drifts from reality.** The schedule preview shown before creating a credit account, and the allocation preview shown before posting a repayment, both call the exact same pure computation function the real create/post path uses. There is no parallel copy of the math in frontend JS that could quietly disagree with the server.
- **Immutable audit trail.** `credit_account_events` is append-only — account status, payments, and other lifecycle events are recorded there, and account balances change only as a result of a posted event, never a direct edit.
- **Real foreign keys over a polymorphic reference.** `ledger_entries` has one separate nullable FK column per possible source (`document_id`, `payment_id`, `vendor_payment_id`, `credit_account_id`) instead of a generic `source_type`/`source_id` pair, so Postgres itself enforces referential integrity on the financial system of record. A CHECK constraint enforces that exactly one of the four is set, matching `source_type`.
- **Multi-tenancy via `company_id`** on every tenant-scoped table, enforced by application-level filtering plus FK/unique-index backstops at the DB layer. Companies (tenants) themselves are the one exception, reachable without a resolved tenant since there's no `company_id` to resolve until a company exists.

## Getting started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup

```bash
# Install dependencies
npm install

# Create the database (name it whatever you set as DB_NAME below)
psql -U postgres -c "CREATE DATABASE saas;"

# Copy the example env file and fill in your own values
cp .env.example .env
```

Run the migrations in `notes/` **in this order** — later files depend on tables/columns earlier ones create:

```bash
psql -U postgres -d saas -f notes/migration_customers.sql
psql -U postgres -d saas -f notes/migration_tenant_and_constraints.sql
psql -U postgres -d saas -f notes/migration_vendors.sql
psql -U postgres -d saas -f notes/migration_customers_extend.sql
psql -U postgres -d saas -f notes/migration_companies_extend.sql
psql -U postgres -d saas -f notes/migration_items.sql
psql -U postgres -d saas -f notes/migration_documents.sql
psql -U postgres -d saas -f notes/migration_payments.sql
psql -U postgres -d saas -f notes/migration_vendor_payments.sql
psql -U postgres -d saas -f notes/migration_ledger.sql
psql -U postgres -d saas -f notes/migration_payment_sequences.sql
psql -U postgres -d saas -f notes/migration_remove_so_quotes_po.sql
psql -U postgres -d saas -f notes/migration_customers_lending_fields.sql
psql -U postgres -d saas -f notes/migration_credit_accounts.sql
psql -U postgres -d saas -f notes/migration_waterfall_config.sql
psql -U postgres -d saas -f notes/migration_repayment_allocations.sql
psql -U postgres -d saas -f notes/migration_customer_mandatory_fields.sql
psql -U postgres -d saas -f notes/migration_customer_identity_uniqueness.sql
psql -U postgres -d saas -f notes/migration_vendor_identity_uniqueness.sql

# Start the server
node server.js
```

This full chain — all 19 files, in this exact order — has been verified end to end against a scratch database: it runs cleanly from empty, and the resulting schema matches the live database table-for-table and column-for-column.

The app runs at `http://localhost:3000`.

**Note:** API routes under `/api/v1` (except `/api/v1/companies`) currently require an `X-Tenant-Id` header (e.g. `X-Tenant-Id: 1`) until real authentication replaces this placeholder. The web UI hardcodes `company_id = 1` the same way.

## Roadmap

- [ ] Authentication and role-based access control
- [ ] Scheduled jobs for overdue status transitions and repayment reminders
- [ ] Notifications — WhatsApp, SMS, and email
- [ ] Penalty waivers and repayment rescheduling (the disabled buttons on the Credit Account detail page)
- [ ] Customer statements
- [ ] Payment gateway integration
- [ ] KYC document storage

## License

MIT — see [LICENSE](LICENSE) for details.

MIT License

Copyright (c) 2026 Zubair Zia

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
