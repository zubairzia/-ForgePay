const express = require('express');
const router = express.Router();
const notificationsController = require('../../controllers/notifications.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_CUSTOMERS_ACCOUNTS } = require('../../middleware/roleGroups');

router.get('/settings/notifications', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), notificationsController.notificationsPage);

module.exports = router;
