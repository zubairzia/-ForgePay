const express = require('express');
const router = express.Router();
const { createDocumentWebController } = require('../../controllers/documentsWeb.controller');

const meta = { basePath: '/invoices', singular: 'Invoice', plural: 'Invoices', direction: 'sales' };
const controller = createDocumentWebController('invoice', meta);

router.get('/invoices', controller.list);
router.get('/invoices/create', controller.createForm);
router.post('/invoices/create', controller.submitCreate);
router.get('/invoices/:id/view', controller.view);
router.get('/invoices/:id/edit', controller.editForm);
router.post('/invoices/:id/update', controller.submitUpdate);
router.post('/invoices/:id/status', controller.submitStatus);

module.exports = router;
