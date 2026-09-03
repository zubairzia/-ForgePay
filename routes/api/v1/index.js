const express = require('express');
const router = express.Router();
const { requirePlan } = require('../../../middleware/plan.middleware');

router.use('/customers', require('./customers.routes'));

// Procurement-side modules — gated behind the Pro plan. Irrelevant to a
// customer-lending SaaS buyer unless they also track their own suppliers.
router.use('/vendors', requirePlan('pro', 'Vendors'), require('./vendors.routes'));
router.use('/expenses', requirePlan('pro', 'Expenses'), require('./expenses.routes'));
router.use('/bills', requirePlan('pro', 'Bills'), require('./bills.routes'));

router.use('/invoices', require('./invoices.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/paymentsmade', require('./paymentsmade.routes'));

module.exports = router;