const express = require('express');
const router = express.Router();
const companiesController = require('../../../controllers/companies.controller');
const { requireRole } = require('../../../middleware/auth.middleware');

// No GET '/' (list) and no POST '/' (create) anymore — company creation
// only happens through registration (services/Auth/localService.js's
// registerCompanyAndOwner), and a tenant only ever has one company: its
// own. This router is now mounted INSIDE the normal requireAuth-protected
// /api/v1 stack (see routes/index.js) instead of ahead of it.
router.get('/:id', requireRole('owner', 'finance_manager', 'read_only'), companiesController.getCompanyById);
router.put('/:id', requireRole('owner', 'finance_manager'), companiesController.updateCompany);

module.exports = router;
