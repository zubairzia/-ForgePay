const localService = require('../services/Repayments/localService');

// GET repayments for a credit account
const getRepayments = async (req, res, next) => {
  try {
    const repayments = await localService.getRepaymentsForAccount(req.tenantId, req.params.id);
    if (!repayments) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.json(repayments);
  } catch (error) {
    next(error);
  }
};

// RECORD a repayment against a credit account
const createRepayment = async (req, res, next) => {
  try {
    const result = await localService.recordRepayment(req.tenantId, req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Credit account not found' });
    }
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRepayments,
  createRepayment,
};
