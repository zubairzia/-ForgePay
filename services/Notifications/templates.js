// All customer-facing notification copy lives here, in one place, so a
// wording change never requires touching the sending logic. Every template
// is a pure function of (language, data) -> body string -- no DB access, no
// side effects, easy to unit test and easy to preview before Twilio (or any
// other real provider) ever exists.

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TEMPLATES = {
  payment_due_soon: {
    en: (data) => `Hi ${data.customerName}, a reminder that your payment of ${money(data.amount)} for account ${data.accountNumber} is due on ${data.dueDate}. Thank you.`,
    ar: (data) => `مرحباً ${data.customerName}، تذكير بأن دفعتك البالغة ${money(data.amount)} لحساب ${data.accountNumber} مستحقة بتاريخ ${data.dueDate}. شكراً لك.`,
  },
  payment_overdue: {
    en: (data) => `Hi ${data.customerName}, your payment of ${money(data.amount)} for account ${data.accountNumber} was due on ${data.dueDate} and is now overdue. Please settle it as soon as possible to avoid further late fees.`,
    ar: (data) => `مرحباً ${data.customerName}، دفعتك البالغة ${money(data.amount)} لحساب ${data.accountNumber} كانت مستحقة بتاريخ ${data.dueDate} وهي متأخرة الآن. يرجى السداد في أقرب وقت ممكن لتجنب رسوم تأخير إضافية.`,
  },
  payment_received: {
    en: (data) => `Hi ${data.customerName}, we've received your payment of ${money(data.amount)} for account ${data.accountNumber}. Thank you.`,
    ar: (data) => `مرحباً ${data.customerName}، لقد استلمنا دفعتك البالغة ${money(data.amount)} لحساب ${data.accountNumber}. شكراً لك.`,
  },
};

const TEMPLATE_KEYS = Object.keys(TEMPLATES);

// Falls back to English for any language without its own variant (or an
// unrecognized one) -- customers.preferred_language defaults to 'en' at
// the schema level too, so this only ever matters for a genuinely missing
// translation, not a missing customer preference.
const renderTemplate = (templateKey, language, data) => {
  const template = TEMPLATES[templateKey];
  if (!template) {
    const err = new Error(`Unknown notification template: ${templateKey}`);
    err.status = 400;
    throw err;
  }
  const renderer = template[language] || template.en;
  return renderer(data);
};

module.exports = { TEMPLATE_KEYS, renderTemplate };
