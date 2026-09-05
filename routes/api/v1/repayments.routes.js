const express = require('express');
// mergeParams so this router (mounted at /credit-accounts/:id/repayments)
// can read :id from the parent router.
const router = express.Router({ mergeParams: true });
const repaymentsController = require('../../../controllers/repayments.controller');

router.get('/', repaymentsController.getRepayments);
router.post('/', repaymentsController.createRepayment);
router.post('/preview', repaymentsController.previewRepayment);

module.exports = router;
