const express = require('express');
const router = express.Router();
const { createDocumentWebController } = require('../../controllers/documentsWeb.controller');

const meta = { basePath: '/bills', singular: 'Bill', plural: 'Bills', direction: 'purchase' };
const controller = createDocumentWebController('bill', meta);

router.get('/bills', controller.list);
router.get('/bills/create', controller.createForm);
router.post('/bills/create', controller.submitCreate);
router.get('/bills/:id/view', controller.view);
router.get('/bills/:id/edit', controller.editForm);
router.post('/bills/:id/update', controller.submitUpdate);
router.post('/bills/:id/status', controller.submitStatus);

module.exports = router;
