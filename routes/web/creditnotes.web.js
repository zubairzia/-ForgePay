const express = require('express');
const router = express.Router();
const { createDocumentWebController } = require('../../controllers/documentsWeb.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../middleware/roleGroups');

// No fixed `direction` here — a credit note can apply against either a
// customer invoice or a vendor bill; the create form lets the user choose
// (see the direction toggle in views/documents/create.ejs), matching
// services/Documents/localService.js's FIXED_DIRECTION_BY_TYPE, which
// deliberately omits credit_note.
const meta = { basePath: '/creditnotes', singular: 'Credit Note', plural: 'Credit Notes' };
const controller = createDocumentWebController('credit_note', meta);

router.get('/creditnotes', requireRole(...VIEW_BACK_OFFICE), controller.list);
router.get('/creditnotes/create', requireRole(...MANAGE_BACK_OFFICE), controller.createForm);
router.post('/creditnotes/create', requireRole(...MANAGE_BACK_OFFICE), controller.submitCreate);
router.get('/creditnotes/:id/view', requireRole(...VIEW_BACK_OFFICE), controller.view);
router.get('/creditnotes/:id/edit', requireRole(...MANAGE_BACK_OFFICE), controller.editForm);
router.post('/creditnotes/:id/update', requireRole(...MANAGE_BACK_OFFICE), controller.submitUpdate);
router.post('/creditnotes/:id/status', requireRole(...MANAGE_BACK_OFFICE), controller.submitStatus);

module.exports = router;
