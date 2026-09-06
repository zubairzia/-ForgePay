const express = require('express');
// mergeParams so this router (mounted at /credit-accounts/:id/repayments)
// can read :id from the parent router.
const router = express.Router({ mergeParams: true });
const repaymentsController = require('../../../controllers/repayments.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_CUSTOMERS_ACCOUNTS, RECORD_MONEY_IN } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), repaymentsController.getRepayments);
router.post('/', requireRole(...RECORD_MONEY_IN), repaymentsController.createRepayment);
router.post('/preview', requireRole(...RECORD_MONEY_IN), repaymentsController.previewRepayment);

module.exports = router;
