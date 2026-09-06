const db = require('../../db');
const { renderTemplate } = require('./templates');
const consoleAdapter = require('./adapters/console');

const round2 = (n) => Math.round(n * 100) / 100;

// Adapter registry -- one implementation per delivery provider, all behind
// the same send(channel, recipient, body) -> { success, errorMessage? }
// contract. Swapping "console" for a real Twilio (or other) adapter here
// is the only change needed anywhere in the app to go live -- no
// provider-specific code exists outside this map and the adapter itself.
const ADAPTERS = { console: consoleAdapter };
const ACTIVE_ADAPTER = ADAPTERS.console;

const send = (channel, recipient, body) => ACTIVE_ADAPTER.send(channel, recipient, body);

// Picks a channel + recipient from whatever contact info the customer has
// on file. Email is preferred (richer for a payment reminder); falls back
// to SMS via mobile, then phone.
const resolveRecipient = (customer) => {
  if (customer.email) return { channel: 'email', recipient: customer.email };
  if (customer.mobile) return { channel: 'sms', recipient: customer.mobile };
  if (customer.phone) return { channel: 'sms', recipient: customer.phone };
  return null;
};

// Composes the reminder matching this account's current state (an already
// overdue installment takes priority over one merely coming up) and
// records + sends it. Reminders are about outstanding installments --
// 'payment_received' exists in the template library for future use (e.g.
// a receipt after recordRepayment) but nothing calls it from here yet.
const sendReminder = async (tenantId, userId, creditAccountId) => {
  const accountResult = await db.query(
    `SELECT ca.*, c.id AS customer_id, c.email, c.phone, c.mobile,
            COALESCE(c.preferred_language, 'en') AS preferred_language,
            COALESCE(NULLIF(TRIM(c.company_name), ''), TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS customer_name
     FROM credit_accounts ca
     JOIN customers c ON c.id = ca.customer_id
     WHERE ca.company_id = $1 AND ca.id = $2`,
    [tenantId, creditAccountId]
  );
  const account = accountResult.rows[0];
  if (!account) return undefined;

  if (!['active', 'overdue'].includes(account.status)) {
    const err = new Error(`Cannot send a reminder for an account that is '${account.status}'`);
    err.status = 409;
    throw err;
  }

  const nextInstallmentResult = await db.query(
    `SELECT * FROM repayment_schedules
     WHERE company_id = $1 AND credit_account_id = $2 AND due_status NOT IN ('paid', 'waived', 'superseded')
     ORDER BY due_date ASC LIMIT 1`,
    [tenantId, creditAccountId]
  );
  const nextInstallment = nextInstallmentResult.rows[0];
  if (!nextInstallment) {
    const err = new Error('This account has no outstanding installments to send a reminder about');
    err.status = 409;
    throw err;
  }

  const destination = resolveRecipient(account);
  if (!destination) {
    const err = new Error('This customer has no email or phone number on file to send a reminder to');
    err.status = 400;
    throw err;
  }

  const templateKey = nextInstallment.due_status === 'overdue' ? 'payment_overdue' : 'payment_due_soon';
  const amount = round2(
    (Number(nextInstallment.principal_due) + Number(nextInstallment.markup_due) + Number(nextInstallment.penalty_due)) -
    (Number(nextInstallment.principal_paid) + Number(nextInstallment.markup_paid) + Number(nextInstallment.penalty_paid))
  );

  const body = renderTemplate(templateKey, account.preferred_language, {
    customerName: account.customer_name,
    amount,
    dueDate: nextInstallment.due_date,
    accountNumber: account.account_number,
  });

  const deliveryResult = await send(destination.channel, destination.recipient, body);

  const inserted = await db.query(
    `INSERT INTO notifications (
      company_id, credit_account_id, customer_id, channel, recipient,
      template_key, body, status, sent_at, error_message, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      tenantId, creditAccountId, account.customer_id, destination.channel, destination.recipient,
      templateKey, body, deliveryResult.success ? 'sent' : 'failed',
      deliveryResult.success ? new Date() : null,
      deliveryResult.success ? null : (deliveryResult.errorMessage || 'Unknown delivery error'),
      userId,
    ]
  );

  return inserted.rows[0];
};

// Read-only list for the /settings/notifications page.
const getNotifications = async (tenantId) => {
  const result = await db.query(
    `SELECT n.*, ca.account_number,
            COALESCE(NULLIF(TRIM(c.company_name), ''), TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS customer_name
     FROM notifications n
     JOIN customers c ON c.id = n.customer_id
     LEFT JOIN credit_accounts ca ON ca.id = n.credit_account_id
     WHERE n.company_id = $1
     ORDER BY n.created_at DESC
     LIMIT 200`,
    [tenantId]
  );
  return result.rows;
};

module.exports = { send, sendReminder, getNotifications };
