const localService = require('../services/CreditAccounts/localService');
const notificationsService = require('../services/Notifications/localService');
const statementsService = require('../services/Statements/localService');

// GET credit accounts (supports ?status= and ?customerId= filters)
const getCreditAccounts = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status || undefined,
      customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
    };
    const accounts = await localService.getAllCreditAccounts(req.tenantId, filters);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
};

// CREATE credit account
const createCreditAccount = async (req, res, next) => {
  try {
    const account = await localService.createCreditAccount(req.tenantId, { ...req.body, createdBy: req.user.id });
    res.status(201).json(account);
  } catch (error) {
    next(error);
  }
};

// PREVIEW a credit account plan (schedule + totals) without persisting
// anything — runs the exact same computeCreditAccountPlan createCreditAccount
// uses, so the numbers shown here can never drift from what gets saved.
const previewCreditAccount = async (req, res, next) => {
  try {
    const plan = localService.previewCreditAccount(req.body);
    res.json(plan);
  } catch (error) {
    next(error);
  }
};

// GET single credit account
const getCreditAccountById = async (req, res, next) => {
  try {
    const account = await localService.getCreditAccountById(req.tenantId, req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.json(account);
  } catch (error) {
    next(error);
  }
};

// GET activity feed for a credit account
const getCreditAccountEvents = async (req, res, next) => {
  try {
    const events = await localService.getCreditAccountEvents(req.tenantId, req.params.id);
    if (!events) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.json(events);
  } catch (error) {
    next(error);
  }
};

// UPDATE credit account status
const updateCreditAccountStatus = async (req, res, next) => {
  try {
    const account = await localService.updateCreditAccountStatus(req.tenantId, req.params.id, req.body.status, req.user.id);
    if (!account) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.json(account);
  } catch (error) {
    next(error);
  }
};

// WAIVE a penalty on one installment (owner/finance_manager only, enforced
// at the route layer)
const waivePenalty = async (req, res, next) => {
  try {
    const installment = await localService.waivePenalty(req.tenantId, req.user.id, req.params.scheduleId, req.body);
    if (!installment) {
      return res.status(404).json({ message: 'Installment not found' });
    }
    res.json(installment);
  } catch (error) {
    next(error);
  }
};

// PREVIEW a reschedule (new schedule + totals) without persisting anything
// -- runs the exact same computeReschedulePlan rescheduleAccount uses.
const previewReschedule = async (req, res, next) => {
  try {
    const plan = await localService.previewReschedule(req.tenantId, req.params.id, req.body);
    if (!plan) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.json(plan);
  } catch (error) {
    next(error);
  }
};

// RESCHEDULE a credit account's remaining balance (owner/finance_manager
// only, enforced at the route layer)
const rescheduleAccount = async (req, res, next) => {
  try {
    const account = await localService.rescheduleAccount(req.tenantId, req.user.id, req.params.id, req.body);
    if (!account) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.json(account);
  } catch (error) {
    next(error);
  }
};

// SEND a payment reminder for this account (owner/finance_manager/cashier,
// enforced at the route layer via RECORD_MONEY_IN)
const sendReminder = async (req, res, next) => {
  try {
    const notification = await notificationsService.sendReminder(req.tenantId, req.user.id, req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
};

// DOWNLOAD a PDF customer statement (every role, including read_only)
const downloadStatement = async (req, res, next) => {
  try {
    const statement = await statementsService.generateStatementPdf(req.tenantId, req.params.id);
    if (!statement) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${statement.accountNumber}.pdf"`);
    res.send(statement.buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCreditAccounts,
  createCreditAccount,
  previewCreditAccount,
  getCreditAccountById,
  getCreditAccountEvents,
  updateCreditAccountStatus,
  waivePenalty,
  previewReschedule,
  rescheduleAccount,
  sendReminder,
  downloadStatement,
};
