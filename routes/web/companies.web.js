const express = require('express');
const router = express.Router();

const companiesController = require('../../controllers/companies.controller');
const { requireRole } = require('../../middleware/auth.middleware');

// Company creation only happens through /register now. This whole module
// is folded into the normal requireAuth-protected web router (see
// routes/web/index.js) instead of being mounted ahead of it — a company
// already exists by the time anyone can reach these pages.
router.get('/companies', companiesController.listCompaniesPage);

router.get('/companies/:id/view', requireRole('owner', 'finance_manager', 'read_only'), companiesController.viewCompany);

router.get('/companies/:id/edit', requireRole('owner', 'finance_manager'), companiesController.editCompany);

router.post('/companies/:id/update', requireRole('owner', 'finance_manager'), companiesController.submitCompanyUpdate);

module.exports = router;
