const localService = require('../services/Payments/localService');

// GET payments
const getPayments = async (req, res, next) => {
  try {
    const payments = await localService.getAllPayments(req.tenantId);
    res.json(payments);
  } catch (error) {
    next(error);
  }
};

// RECORD payment
const createPayment = async (req, res, next) => {
  try {
    const payment = await localService.recordPayment(req.tenantId, req.body);
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
};

// GET single payment
const getPaymentById = async (req, res, next) => {
  try {
    const payment = await localService.getPaymentById(req.tenantId, req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPayments,
  createPayment,
  getPaymentById,
};
