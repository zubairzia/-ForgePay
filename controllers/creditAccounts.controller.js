const localService = require('../services/CreditAccounts/localService');

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
    const account = await localService.createCreditAccount(req.tenantId, req.body);
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
    const account = await localService.updateCreditAccountStatus(req.tenantId, req.params.id, req.body.status);
    if (!account) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.json(account);
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
};
