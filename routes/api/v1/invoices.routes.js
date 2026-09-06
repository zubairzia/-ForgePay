const express = require('express');
const router = express.Router();
const invoicesController = require('../../../controllers/invoices.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_BACK_OFFICE), invoicesController.getInvoices);
router.post('/', requireRole(...MANAGE_BACK_OFFICE), invoicesController.createInvoice);
router.get('/:id', requireRole(...VIEW_BACK_OFFICE), invoicesController.getInvoiceById);
router.put('/:id', requireRole(...MANAGE_BACK_OFFICE), invoicesController.updateInvoice);
router.patch('/:id/status', requireRole(...MANAGE_BACK_OFFICE), invoicesController.updateInvoiceStatus);

module.exports = router;
