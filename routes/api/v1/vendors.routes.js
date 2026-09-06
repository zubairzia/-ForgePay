const express = require('express');
const router = express.Router();

const vendorsController = require('../../../controllers/vendors.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_BACK_OFFICE), vendorsController.getVendors);
router.get('/search', requireRole(...VIEW_BACK_OFFICE), vendorsController.searchVendors);
router.post('/create', requireRole(...MANAGE_BACK_OFFICE), vendorsController.createVendor);
router.get('/:vendor_code', requireRole(...VIEW_BACK_OFFICE), vendorsController.getVendorById);
router.put('/:vendor_code', requireRole(...MANAGE_BACK_OFFICE), vendorsController.updateVendor);

module.exports = router;
