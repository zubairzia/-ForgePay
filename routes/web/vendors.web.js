const express = require('express');
const router = express.Router();

const vendorsController = require('../../controllers/vendors.controller');

// Vendor Pages
router.get('/vendors', (req, res) => {
  res.render('vendors/index');
});

router.get('/vendors/create', (req, res) => {
  res.render('vendors/create');
});

// Create form posts here directly (web layer, not the API layer) so it can
// rely on webTenantMiddleware's hardcoded tenantId instead of needing a
// custom X-Tenant-Id header, which a plain HTML <form> can't send.
router.post('/vendors/create', vendorsController.createVendor);

router.get('/vendors/:vendor_code/view', vendorsController.viewVendor);

router.get('/vendors/:vendor_code/edit', vendorsController.editVendor);

router.post('/vendors/:vendor_code/update', vendorsController.submitVendorUpdate);

module.exports = router;
