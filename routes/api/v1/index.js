const express = require('express');
const router = express.Router();

router.use('/customers', require('./customers.routes'));
router.use('/vendors', require('./vendors.routes'));
router.use('/items', require('./items.routes'));

router.use('/invoices', require('./invoices.routes'));
router.use('/quotes', require('./quotes.routes'));
router.use('/salesorders', require('./salesorders.routes'));
router.use('/purchaseorders', require('./purchaseorders.routes'));
router.use('/bills', require('./bills.routes'));
router.use('/creditnotes', require('./creditnotes.routes'));

router.use('/payments', require('./payments.routes'));
router.use('/paymentsmade', require('./paymentsmade.routes'));

module.exports = router;