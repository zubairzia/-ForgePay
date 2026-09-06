const express = require('express');
const router = express.Router();
const paymentsController = require('../../../controllers/payments.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_CUSTOMERS_ACCOUNTS, RECORD_MONEY_IN } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), paymentsController.getPayments);
router.post('/', requireRole(...RECORD_MONEY_IN), paymentsController.createPayment);
router.get('/:id', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), paymentsController.getPaymentById);

module.exports = router;
