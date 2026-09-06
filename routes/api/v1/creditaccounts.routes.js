const express = require('express');
const router = express.Router();
const creditAccountsController = require('../../../controllers/creditAccounts.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_CUSTOMERS_ACCOUNTS, MANAGE_CUSTOMERS_ACCOUNTS, MANAGERS, RECORD_MONEY_IN, ALL_ROLES } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), creditAccountsController.getCreditAccounts);
router.post('/', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), creditAccountsController.createCreditAccount);
router.post('/preview', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), creditAccountsController.previewCreditAccount);
router.get('/:id', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), creditAccountsController.getCreditAccountById);
router.get('/:id/events', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), creditAccountsController.getCreditAccountEvents);
router.patch('/:id/status', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), creditAccountsController.updateCreditAccountStatus);
router.patch('/:id/schedule/:scheduleId/waive-penalty', requireRole(...MANAGERS), creditAccountsController.waivePenalty);
router.post('/:id/reschedule/preview', requireRole(...MANAGERS), creditAccountsController.previewReschedule);
router.post('/:id/reschedule', requireRole(...MANAGERS), creditAccountsController.rescheduleAccount);
router.post('/:id/send-reminder', requireRole(...RECORD_MONEY_IN), creditAccountsController.sendReminder);
router.get('/:id/statement', requireRole(...ALL_ROLES), creditAccountsController.downloadStatement);

router.use('/:id/repayments', require('./repayments.routes'));

module.exports = router;
