const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/settings.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { verifyCsrfToken } = require('../../middleware/csrf.middleware');

// User management is owner-only to WRITE ("finance_manager: everything
// except user management"). read_only can view the list too, alongside
// owner -- "read_only: GET only, everywhere" is read as full read
// visibility (an auditor/oversight role), just never write power; every
// other role gets nothing here, since neither cashier nor sales_agent's
// spec mentions this area at all.
router.get('/settings/users', requireRole('owner', 'read_only'), settingsController.usersPage);
router.post('/settings/users/invite', requireRole('owner'), verifyCsrfToken, settingsController.submitInvite);
router.post('/settings/users/:id/deactivate', requireRole('owner'), verifyCsrfToken, settingsController.submitDeactivate);
router.post('/settings/users/:id/reactivate', requireRole('owner'), verifyCsrfToken, settingsController.submitReactivate);
router.post('/settings/users/:id/role', requireRole('owner'), verifyCsrfToken, settingsController.submitChangeRole);

module.exports = router;
