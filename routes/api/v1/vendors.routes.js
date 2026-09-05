const express = require('express');
const router = express.Router();

const vendorsController = require('../../../controllers/vendors.controller');

router.get('/', vendorsController.getVendors);
router.get('/search', vendorsController.searchVendors);
router.post('/create', vendorsController.createVendor);
router.get('/:vendor_code', vendorsController.getVendorById);
router.put('/:vendor_code', vendorsController.updateVendor);

module.exports = router;
