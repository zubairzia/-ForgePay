const express = require('express');
const router = express.Router();

const vendorsController = require('../../controllers/vendors.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../middleware/roleGroups');

// Vendor Pages
router.get('/vendors', requireRole(...VIEW_BACK_OFFICE), (req, res) => {
  res.render('vendors/index');
});

router.get('/vendors/create', requireRole(...MANAGE_BACK_OFFICE), (req, res) => {
  res.render('vendors/create');
});

router.post('/vendors/create', requireRole(...MANAGE_BACK_OFFICE), vendorsController.createVendor);

router.get('/vendors/:vendor_code/view', requireRole(...VIEW_BACK_OFFICE), vendorsController.viewVendor);

router.get('/vendors/:vendor_code/edit', requireRole(...MANAGE_BACK_OFFICE), vendorsController.editVendor);

router.post('/vendors/:vendor_code/update', requireRole(...MANAGE_BACK_OFFICE), vendorsController.submitVendorUpdate);

module.exports = router;
