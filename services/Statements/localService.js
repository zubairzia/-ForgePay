const PDFDocument = require('pdfkit');
const db = require('../../db');

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const value = dateStr instanceof Date ? dateStr.toISOString().slice(0, 10) : String(dateStr);
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${month}/${day}/${year}`;
};

const DUE_STATUS_LABELS = {
  upcoming: 'Upcoming',
  due: 'Due',
  partial: 'Partially Paid',
  overdue: 'Overdue',
  paid: 'Paid',
  waived: 'Waived',
  superseded: 'Superseded (rescheduled)',
};

// Everything this statement needs, in one place -- read-only, no
// transaction required since nothing is written.
const fetchStatementData = async (tenantId, creditAccountId) => {
  const accountResult = await db.query(
    `SELECT ca.*, comp.name AS company_name, comp.legal_name AS company_legal_name, comp.currency AS company_currency
     FROM credit_accounts ca
     JOIN companies comp ON comp.id = ca.company_id
     WHERE ca.company_id = $1 AND ca.id = $2`,
    [tenantId, creditAccountId]
  );
  const account = accountResult.rows[0];
  if (!account) return undefined;

  const customerResult = await db.query('SELECT * FROM customers WHERE id = $1', [account.customer_id]);
  const customer = customerResult.rows[0];

  const scheduleResult = await db.query(
    'SELECT * FROM repayment_schedules WHERE credit_account_id = $1 ORDER BY installment_number',
    [creditAccountId]
  );

  const paymentsResult = await db.query(
    `SELECT DISTINCT p.id, p.payment_number, p.payment_date, p.amount, p.payment_method, p.reference_number
     FROM payments p
     JOIN payment_allocations pa ON pa.payment_id = p.id
     JOIN repayment_schedules rs ON rs.id = pa.repayment_schedule_id
     WHERE p.company_id = $1 AND rs.credit_account_id = $2
     ORDER BY p.payment_date ASC, p.id ASC`,
    [tenantId, creditAccountId]
  );

  return { account, customer, schedule: scheduleResult.rows, payments: paymentsResult.rows };
};

const customerDisplayName = (customer) => {
  if (!customer) return '-';
  const company = (customer.company_name || '').trim();
  if (company) return company;
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '-';
};

// Renders the statement into a PDFDocument and resolves with the complete
// PDF as a Buffer once the stream finishes -- small enough documents that
// buffering in memory rather than piping straight to the response is
// simpler and still perfectly fine here.
const renderStatementPdf = (data) => new Promise((resolve, reject) => {
  const { account, customer, schedule, payments } = data;
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const currency = account.company_currency || '';

  // ---- Header ----
  doc.fontSize(18).font('Helvetica-Bold').text(account.company_legal_name || account.company_name, { continued: false });
  doc.fontSize(10).font('Helvetica').fillColor('#555').text('Customer Statement').fillColor('black');
  doc.moveDown(1);

  doc.fontSize(9).fillColor('#555').text(`Generated: ${formatDate(new Date())}`, { align: 'right' });
  doc.fillColor('black');
  doc.moveDown(0.5);

  // ---- Customer + Account details, side by side ----
  const topY = doc.y;
  doc.fontSize(11).font('Helvetica-Bold').text('Customer', 50, topY);
  doc.fontSize(9).font('Helvetica')
    .text(customerDisplayName(customer), 50, doc.y + 2)
    .text(customer?.email || '-', 50)
    .text(customer?.phone || customer?.mobile || '-', 50);

  doc.fontSize(11).font('Helvetica-Bold').text('Account', 320, topY);
  doc.fontSize(9).font('Helvetica')
    .text(`Account #: ${account.account_number}`, 320, topY + 16)
    .text(`Status: ${account.status}`, 320)
    .text(`Start Date: ${formatDate(account.start_date)}`, 320)
    .text(`Maturity Date: ${formatDate(account.maturity_date)}`, 320);

  doc.moveDown(2);

  // ---- Terms ----
  doc.fontSize(11).font('Helvetica-Bold').text('Terms');
  doc.fontSize(9).font('Helvetica');
  const terms = [
    ['Principal Amount', money(account.principal_amount)],
    ['Down Payment', money(account.down_payment_amount)],
    ['Markup Amount', money(account.markup_amount)],
    ['Financed Amount', money(account.financed_amount)],
    ['Total Payable', money(account.total_payable_amount)],
  ];
  terms.forEach(([label, value]) => {
    doc.text(`${label}: ${currency} ${value}`.trim());
  });
  doc.moveDown(1);

  // ---- Repayment schedule table ----
  doc.fontSize(11).font('Helvetica-Bold').text('Repayment Schedule');
  doc.moveDown(0.3);

  const colX = { n: 50, due: 80, principal: 150, markup: 220, penalty: 285, paid: 350, remaining: 415, status: 480 };
  const rowHeight = 16;

  const drawScheduleHeader = () => {
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('#', colX.n, doc.y, { width: 25 });
    doc.text('Due Date', colX.due, doc.y, { width: 65 });
    doc.text('Principal', colX.principal, doc.y, { width: 65, align: 'right' });
    doc.text('Markup', colX.markup, doc.y, { width: 60, align: 'right' });
    doc.text('Penalty', colX.penalty, doc.y, { width: 60, align: 'right' });
    doc.text('Paid', colX.paid, doc.y, { width: 60, align: 'right' });
    doc.text('Remaining', colX.remaining, doc.y, { width: 60, align: 'right' });
    doc.text('Status', colX.status, doc.y, { width: 90 });
    doc.moveDown(1);
    doc.font('Helvetica');
  };

  drawScheduleHeader();

  schedule.forEach((line) => {
    if (doc.y > 700) {
      doc.addPage();
      drawScheduleHeader();
    }
    const y = doc.y;
    const due = Number(line.principal_due) + Number(line.markup_due) + Number(line.penalty_due);
    const paid = Number(line.principal_paid) + Number(line.markup_paid) + Number(line.penalty_paid);
    const remaining = Math.max(0, due - paid);

    doc.fontSize(8);
    doc.text(String(line.installment_number), colX.n, y, { width: 25 });
    doc.text(formatDate(line.due_date), colX.due, y, { width: 65 });
    doc.text(money(line.principal_due), colX.principal, y, { width: 65, align: 'right' });
    doc.text(money(line.markup_due), colX.markup, y, { width: 60, align: 'right' });
    doc.text(money(line.penalty_due), colX.penalty, y, { width: 60, align: 'right' });
    doc.text(money(paid), colX.paid, y, { width: 60, align: 'right' });
    doc.text(money(remaining), colX.remaining, y, { width: 60, align: 'right' });
    doc.text(DUE_STATUS_LABELS[line.due_status] || line.due_status, colX.status, y, { width: 90 });
    doc.moveDown(0.9);
  });

  doc.moveDown(1);

  // ---- Payment history ----
  if (doc.y > 650) doc.addPage();
  doc.fontSize(11).font('Helvetica-Bold').text('Payment History');
  doc.fontSize(9).font('Helvetica');
  doc.moveDown(0.3);
  if (payments.length === 0) {
    doc.text('No payments recorded yet.');
  } else {
    payments.forEach((p) => {
      if (doc.y > 720) doc.addPage();
      doc.text(`${p.payment_number}  —  ${formatDate(p.payment_date)}  —  ${currency} ${money(p.amount)}`);
    });
  }

  doc.moveDown(1.5);

  // ---- Current outstanding totals ----
  if (doc.y > 650) doc.addPage();
  const totalOutstanding = Number(account.outstanding_principal) + Number(account.outstanding_markup) + Number(account.outstanding_penalty);
  doc.fontSize(11).font('Helvetica-Bold').text('Current Outstanding');
  doc.fontSize(9).font('Helvetica');
  doc.text(`Principal: ${currency} ${money(account.outstanding_principal)}`.trim());
  doc.text(`Markup: ${currency} ${money(account.outstanding_markup)}`.trim());
  doc.text(`Penalty: ${currency} ${money(account.outstanding_penalty)}`.trim());
  doc.font('Helvetica-Bold').text(`Total Outstanding: ${currency} ${money(totalOutstanding)}`.trim());

  doc.end();
});

const generateStatementPdf = async (tenantId, creditAccountId) => {
  const data = await fetchStatementData(tenantId, creditAccountId);
  if (!data) return undefined;
  const buffer = await renderStatementPdf(data);
  return { buffer, accountNumber: data.account.account_number };
};

module.exports = { generateStatementPdf };
