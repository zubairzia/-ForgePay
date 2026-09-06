const express = require('express');
const router = express.Router();
const dashboardController = require('../../../controllers/dashboard.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { ALL_ROLES } = require('../../../middleware/roleGroups');

// Read-only aggregate of data every role already has some view access to
// — every authenticated role can see it.
router.get('/summary', requireRole(...ALL_ROLES), dashboardController.getDashboardSummary);

module.exports = router;
