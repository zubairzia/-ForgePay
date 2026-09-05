const express = require('express');
const router = express.Router();
const invoicesController = require('../../../controllers/invoices.controller');

router.get('/', invoicesController.getInvoices);
router.post('/', invoicesController.createInvoice);
router.get('/:id', invoicesController.getInvoiceById);
router.put('/:id', invoicesController.updateInvoice);
router.patch('/:id/status', invoicesController.updateInvoiceStatus);

module.exports = router;
