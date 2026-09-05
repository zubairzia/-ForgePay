const express = require('express');
const router = express.Router();

router.use('/customers', require('./customers.routes'));
router.use('/vendors', require('./vendors.routes'));

router.use('/invoices', require('./invoices.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/paymentsmade', require('./paymentsmade.routes'));

module.exports = router;