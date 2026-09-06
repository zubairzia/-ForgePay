// Named role groups for requireRole(...allowedRoles), derived directly
// from the spec these were built against:
//   owner            — everything, including user management
//   finance_manager  — everything except user management
//   cashier          — record repayments and payments, view
//                      customers/accounts; NOT create/edit credit
//                      accounts, NOT waive or reschedule
//   sales_agent      — create/edit customers and credit accounts; NOT
//                      record payments
//   read_only        — GET only, everywhere
//
// Neither cashier nor sales_agent's spec mentions vendors, items,
// invoices, bills, credit notes, or vendor payments at all, so those stay
// owner/finance_manager (+ read_only for viewing) — least privilege,
// nothing implied that wasn't stated. Dashboard is the one exception:
// it's a read-only aggregate of data every role already has some view
// access to, so every authenticated role can see it.
const ALL_ROLES = ['owner', 'finance_manager', 'cashier', 'sales_agent', 'read_only'];
const MANAGERS = ['owner', 'finance_manager'];

// Customers + Credit Accounts: viewing.
const VIEW_CUSTOMERS_ACCOUNTS = ['owner', 'finance_manager', 'cashier', 'sales_agent', 'read_only'];
// Customers + Credit Accounts: create/edit (not repayments/payments).
const MANAGE_CUSTOMERS_ACCOUNTS = ['owner', 'finance_manager', 'sales_agent'];

// Recording money coming in: repayments (against credit accounts) and
// payments (against invoices) — cashier's explicit job.
const RECORD_MONEY_IN = ['owner', 'finance_manager', 'cashier'];

// Vendors, Items, Invoices, Bills, Credit Notes, Vendor Payments: viewing.
const VIEW_BACK_OFFICE = ['owner', 'finance_manager', 'read_only'];
// Same, write access.
const MANAGE_BACK_OFFICE = MANAGERS;

module.exports = {
  ALL_ROLES,
  MANAGERS,
  VIEW_CUSTOMERS_ACCOUNTS,
  MANAGE_CUSTOMERS_ACCOUNTS,
  RECORD_MONEY_IN,
  VIEW_BACK_OFFICE,
  MANAGE_BACK_OFFICE,
};
