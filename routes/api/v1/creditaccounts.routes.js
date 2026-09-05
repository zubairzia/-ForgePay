const express = require('express');
const router = express.Router();
const creditAccountsController = require('../../../controllers/creditAccounts.controller');

router.get('/', creditAccountsController.getCreditAccounts);
router.post('/', creditAccountsController.createCreditAccount);
router.get('/:id', creditAccountsController.getCreditAccountById);
router.patch('/:id/status', creditAccountsController.updateCreditAccountStatus);

router.use('/:id/repayments', require('./repayments.routes'));

module.exports = router;
