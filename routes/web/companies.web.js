const express = require('express');
const router = express.Router();

const companiesController = require('../../controllers/companies.controller');

// Company (tenant) pages. Deliberately has NO tenantId/tenant middleware
// anywhere in this file — a company IS a tenant, so there's no tenant
// context to require here. This mirrors routes/api/v1/companies.routes.js,
// and this whole file is mounted outside webTenantMiddleware in
// routes/index.js for the same reason.

router.get('/companies', companiesController.listCompaniesPage);

router.get('/companies/create', companiesController.createCompanyPage);

router.post('/companies/create', companiesController.submitCompanyCreate);

router.get('/companies/:id/view', companiesController.viewCompany);

router.get('/companies/:id/edit', companiesController.editCompany);

router.post('/companies/:id/update', companiesController.submitCompanyUpdate);

module.exports = router;
