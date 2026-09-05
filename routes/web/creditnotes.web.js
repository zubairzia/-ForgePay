const express = require('express');
const router = express.Router();
const { createDocumentWebController } = require('../../controllers/documentsWeb.controller');

// No fixed `direction` here — a credit note can apply against either a
// customer invoice or a vendor bill; the create form lets the user choose
// (see the direction toggle in views/documents/create.ejs), matching
// services/Documents/localService.js's FIXED_DIRECTION_BY_TYPE, which
// deliberately omits credit_note.
const meta = { basePath: '/creditnotes', singular: 'Credit Note', plural: 'Credit Notes' };
const controller = createDocumentWebController('credit_note', meta);

router.get('/creditnotes', controller.list);
router.get('/creditnotes/create', controller.createForm);
router.post('/creditnotes/create', controller.submitCreate);
router.get('/creditnotes/:id/view', controller.view);
router.get('/creditnotes/:id/edit', controller.editForm);
router.post('/creditnotes/:id/update', controller.submitUpdate);
router.post('/creditnotes/:id/status', controller.submitStatus);

module.exports = router;
