const express = require('express');
const router = express.Router();
const { createDocumentWebController } = require('../../controllers/documentsWeb.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../middleware/roleGroups');

const meta = { basePath: '/bills', singular: 'Bill', plural: 'Bills', direction: 'purchase' };
const controller = createDocumentWebController('bill', meta);

router.get('/bills', requireRole(...VIEW_BACK_OFFICE), controller.list);
router.get('/bills/create', requireRole(...MANAGE_BACK_OFFICE), controller.createForm);
router.post('/bills/create', requireRole(...MANAGE_BACK_OFFICE), controller.submitCreate);
router.get('/bills/:id/view', requireRole(...VIEW_BACK_OFFICE), controller.view);
router.get('/bills/:id/edit', requireRole(...MANAGE_BACK_OFFICE), controller.editForm);
router.post('/bills/:id/update', requireRole(...MANAGE_BACK_OFFICE), controller.submitUpdate);
router.post('/bills/:id/status', requireRole(...MANAGE_BACK_OFFICE), controller.submitStatus);

module.exports = router;
