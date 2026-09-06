# Session handoff — Authentication & RBAC

## Status: feature-complete and live-verified, not yet committed

This session built the full auth/RBAC system that replaces the hardcoded
tenant placeholder across the whole app. It's working and extensively
tested live — see verification results below — but sitting uncommitted at
your explicit request ("don't commit until I've reviewed").

## What was built

**Phase 1 — Schema** (`notes/migration_users_and_auth.sql`, applied to the
live DB):
- `users` table (per-company unique email, 5 roles, bcrypt hash, etc.)
- `session` table — connect-pg-simple's own schema, used verbatim
- Wired up 4 FKs that were waiting on `users` to exist: `documents.created_by`,
  `credit_account_events.performed_by`, `customers.assigned_agent_id`,
  and `credit_accounts.created_by` (this last one wasn't explicitly asked
  for but is the identical pattern — flagged and included).
- One orphan value found and nulled per your decision: `customers.assigned_agent_id`
  had a stray `7` on customer id 16 with no real user behind it.

**Phase 2 — Auth core:**
- `services/Auth/localService.js` — `registerCompanyAndOwner` (one
  transaction: company + owner user, all-or-nothing), `login` (tries the
  password against every same-email user across all companies, since
  email is only unique per-tenant — your call, from the mid-session
  question), plus user-management functions backing Settings > Users.
- `middleware/auth.middleware.js` — `requireAuth`, `requireRole`.
- `middleware/csrf.middleware.js` — hand-rolled synchronizer-token CSRF
  for the EJS forms (no extra dependency; `csurf` is deprecated).
- `app.js` — `express-session` + `connect-pg-simple`, session cookie is
  httpOnly/sameSite=lax, `secure` flips on via `NODE_ENV=production`.
- `middleware/tenant.middleware.js` deleted; `X-Tenant-Id` header path
  removed entirely, not left as a fallback.

**Phase 3 — Routes, pages, protection:**
- `/register`, `/login`, `/logout`, `/settings/users` (owner: full CRUD on
  company users; read_only: view only — see role notes below).
- Every existing route (customers, vendors, items, credit accounts,
  repayments, invoices, bills, credit notes, payments, vendor payments,
  companies, dashboard) now has `requireRole(...)` per
  `middleware/roleGroups.js`'s named groups.
- Companies module rewritten: the old unprotected create path is gone —
  a company can only come into existence via registration. List/edit are
  now scoped to the caller's own `req.tenantId`, not an arbitrary `:id`.
- CSRF hidden field added to all 10 pre-existing plain-HTML forms
  (customers, vendors, items, companies, documents create/edit/status) —
  checked via grep, none missing.
- `created_by` / `performed_by` now set from `req.user.id` everywhere a
  credit account, document, or repayment gets created.

## Two real bugs found during verification and fixed

1. **CSRF wrongly rejecting API requests.** `routes/index.js` mounted the
   web router at `/` before the API router at `/api/v1` — Express prefix-matches
   `/` against everything, so `verifyCsrfToken` ran on JSON API calls too
   and rejected them for missing `_csrf`. Fixed by mounting `/api/v1` first.
2. **`req.path` vs `req.originalUrl` in nested routers.** `requireRole`'s
   JSON-vs-redirect branch checked `req.path.startsWith('/api/v1')`, but
   `req.path` is relative to whichever router is currently handling the
   request — three levels deep (e.g. `/api/v1/credit-accounts/:id/repayments`)
   it's just `/`. Switched both `requireAuth` and `requireRole` to
   `req.originalUrl`, which is always the full path.

Both were caught live (curl tests returning the wrong error shape), fixed,
and re-verified.

## Verification performed (all live, via browser + curl)

- Registered Company A (Alice, owner) and Company B (Bilal, owner) — both
  auto-logged-in, DB rows confirmed.
- Confirmed atomicity: a registration with a bad password left **no**
  orphan company or user row.
- Confirmed session survives a full server restart (connect-pg-simple
  genuinely persists to Postgres, not memory) — verified by inspecting
  the `session` table directly, then restarting and reloading.
- Confirmed logged-out access redirects web pages to `/login` and returns
  401 JSON from `/api/v1/*`.
- **Critical tenant isolation**: created a customer under each company,
  confirmed each owner sees only their own, and confirmed sending
  `X-Tenant-Id` for the *other* company's id via `fetch()` changes
  **nothing** — tested in both directions.
- Cashier (Cindy): blocked (403) from creating a credit account;
  successfully searched, previewed, and posted a repayment.
- Sales agent (Sam): created a customer and a credit account; blocked
  (403) from both repayment endpoints (create and preview).
- Read-only (Rita): GET succeeds, POST blocked (403).
- `credit_account_events.performed_by` confirmed correctly attributed
  per-actor: Alice for `ACCOUNT_OPENED`/`STATUS_CHANGED`, Cindy for
  `PAYMENT_POSTED` on the same account.

## Left mid-flight (safe, not blocking)

Cleaning up now-vestigial `const tenantHeaders = { 'X-Tenant-Id': '1' }`
from frontend JS — the header is harmless dead code now (server ignores
it entirely; the session cookie is what actually authenticates same-origin
`fetch()` calls). Done in **2 of 8** files
(`public/js/creditaccounts-create.js`, `public/js/creditaccounts-view.js`
— both verified consistent, no dangling references, `node --check` clean).
**Still has the dead header** (functionally harmless, just stale):
`public/js/creditaccounts.js`, `customers.js`, `dashboard.js`, `items.js`,
`repayments-create.js`, `vendors.js`. Same mechanical fix each time:
delete the `tenantHeaders`/`jsonHeaders` spread and drop `{ headers: tenantHeaders }`
from each `fetch()` call.

## Next step

1. Finish the 6-file dead-header cleanup above (cosmetic, ~5 min).
2. Review the diff (`git status` shows everything currently uncommitted —
   this is one coherent, working feature, safe to commit as a single
   unit once you've looked it over).
3. Restart the server fresh and spot-check once more before committing,
   since the last few edits (the 2-file cleanup) were made after the most
   recent restart and haven't been re-verified live (though they're
   static frontend files with no server-side effect, so this is low-risk).
4. Not yet done, worth deciding on: no UI hides nav links a role can't
   use (e.g. a cashier still sees "Vendors" in the sidebar, gets a 403 if
   they click it) — everything is correctly *enforced*, just not hidden.
   Wasn't asked for explicitly; flagging as a judgment call.
