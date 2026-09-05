const localService = require('../services/VendorPayments/localService');

// GET vendor payments
const getPaymentsMade = async (req, res, next) => {
  try {
    const vendorPayments = await localService.getAllVendorPayments(req.tenantId);
    res.json(vendorPayments);
  } catch (error) {
    next(error);
  }
};

// RECORD vendor payment
const createPaymentMade = async (req, res, next) => {
  try {
    const vendorPayment = await localService.recordVendorPayment(req.tenantId, req.body);
    res.status(201).json(vendorPayment);
  } catch (error) {
    next(error);
  }
};

// GET single vendor payment
const getPaymentMadeById = async (req, res, next) => {
  try {
    const vendorPayment = await localService.getVendorPaymentById(req.tenantId, req.params.id);
    if (!vendorPayment) {
      return res.status(404).json({ message: 'Vendor payment not found' });
    }
    res.json(vendorPayment);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPaymentsMade,
  createPaymentMade,
  getPaymentMadeById,
};
