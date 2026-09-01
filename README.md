# ForgePay

A multi-tenant CRM/ERP platform built for GCC trading and distribution SMBs, with **ZATCA-compliant e-invoicing** as its core differentiator — not a generic CRM competing on feature breadth.

> **Status: early-stage / actively in development.** Core architecture and the Customers/Vendors modules are functional. Invoicing, Sales Orders, Purchase Orders, Payments, and Bills are scaffolded but not yet implemented. This is not production-ready.

## Why ForgePay

Most CRM/ERP tools treat regional e-invoicing compliance as an afterthought. ForgePay is built the other way around: compliance-first, with AI features (OCR-based bill parsing, natural language querying) added deliberately and later, once the compliant core is solid — not as a headline feature with nothing underneath it.

## Tech stack

- **Backend:** Node.js, Express 5
- **Database:** PostgreSQL, with Row Level Security for tenant isolation
- **Views:** EJS
- **Styling:** Tailwind CSS

## Current module status

| Module | Status |
|---|---|
| Customers | ✅ Working — full CRUD, tenant-scoped, validated |
| Vendors | ✅ Working — full CRUD, tenant-scoped, validated |
| Invoices | 🚧 Scaffolded, not implemented |
| Quotes | 🚧 Scaffolded, not implemented |
| Sales Orders | 🚧 Scaffolded, not implemented |
| Purchase Orders | 🚧 Scaffolded, not implemented |
| Bills | 🚧 Scaffolded, not implemented |
| Payments | 🚧 Scaffolded, not implemented |
| Authentication | ❌ Not yet implemented — planned next |

## Architecture notes

- **Multi-tenancy:** every table is scoped by `company_id`, enforced at the application layer via `middleware/tenant.middleware.js`, with PostgreSQL constraints as a backstop. Tenant resolution currently uses a placeholder header (`X-Tenant-Id`) pending real authentication.
- **Documents (planned):** invoices, quotes, sales orders, purchase orders, bills, and credit notes will share a unified header + line-items table design, parameterized by document `type`, rather than duplicating near-identical schemas per document.

## Getting started

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+

### Setup

```bash
# Install dependencies
npm install

# Create the database
psql -U postgres -c "CREATE DATABASE saas;"

# Copy the example env file and fill in your own values
cp .env.example .env

# Run the schema migrations (in order)
psql -U postgres -d saas -f notes/migration_customers.sql
psql -U postgres -d saas -f notes/migration_tenant_and_constraints.sql
psql -U postgres -d saas -f notes/migration_vendors.sql

# Start the server
node server.js
```

The app runs at `http://localhost:3000`.

**Note:** API routes under `/api/v1` currently require an `X-Tenant-Id` header (e.g. `X-Tenant-Id: 1`) until real authentication replaces this placeholder.

## Roadmap

- [ ] Authentication (sessions/JWT) and real tenant resolution
- [ ] Unified document schema for Invoices/Quotes/SOs/POs/Bills/Credit Notes
- [ ] ZATCA-compliant e-invoicing
- [ ] Regional payment gateway integration (Moyasar/PayTabs/HyperPay)
- [ ] WhatsApp Business API for invoice delivery
- [ ] Bill/invoice OCR parsing (first AI feature)
- [ ] Zoho Books import/export bridge

## License

Not yet decided / private project.
