const express = require('express');
const router = express.Router();
const companiesController = require('../../../controllers/companies.controller');

// This router is mounted OUTSIDE tenantMiddleware in routes/index.js — a
// company must be creatable (and readable, e.g. by an onboarding flow)
// before any tenant context exists. See the mount point there for details.

router.get('/', companiesController.getCompanies);
router.post('/', companiesController.createCompany);
router.get('/:id', companiesController.getCompanyById);
router.put('/:id', companiesController.updateCompany);

module.exports = router;
