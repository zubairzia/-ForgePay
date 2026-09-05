const express = require('express');
const router = express.Router();

router.use('/customers', require('./customers.routes'));
router.use('/vendors', require('./vendors.routes'));
router.use('/items', require('./items.routes'));

router.use('/invoices', require('./invoices.routes'));
router.use('/bills', require('./bills.routes'));
router.use('/creditnotes', require('./creditnotes.routes'));

router.use('/payments', require('./payments.routes'));
router.use('/paymentsmade', require('./paymentsmade.routes'));

router.use('/credit-accounts', require('./creditaccounts.routes'));

router.use('/dashboard', require('./dashboard.routes'));

module.exports = router;