const express = require('express');
const router = express.Router();
const { createDocumentWebController } = require('../../controllers/documentsWeb.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../middleware/roleGroups');

const meta = { basePath: '/invoices', singular: 'Invoice', plural: 'Invoices', direction: 'sales' };
const controller = createDocumentWebController('invoice', meta);

router.get('/invoices', requireRole(...VIEW_BACK_OFFICE), controller.list);
router.get('/invoices/create', requireRole(...MANAGE_BACK_OFFICE), controller.createForm);
router.post('/invoices/create', requireRole(...MANAGE_BACK_OFFICE), controller.submitCreate);
router.get('/invoices/:id/view', requireRole(...VIEW_BACK_OFFICE), controller.view);
router.get('/invoices/:id/edit', requireRole(...MANAGE_BACK_OFFICE), controller.editForm);
router.post('/invoices/:id/update', requireRole(...MANAGE_BACK_OFFICE), controller.submitUpdate);
router.post('/invoices/:id/status', requireRole(...MANAGE_BACK_OFFICE), controller.submitStatus);

module.exports = router;
