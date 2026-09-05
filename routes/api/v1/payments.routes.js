const express = require('express');
const router = express.Router();
const paymentsController = require('../../../controllers/payments.controller');

router.get('/', paymentsController.getPayments);
router.post('/', paymentsController.createPayment);
router.get('/:id', paymentsController.getPaymentById);

module.exports = router;
