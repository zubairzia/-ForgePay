const express = require('express');
const router = express.Router();
const itemsController = require('../../../controllers/items.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_BACK_OFFICE), itemsController.getItems);
router.get('/search', requireRole(...VIEW_BACK_OFFICE), itemsController.searchItems);
router.post('/', requireRole(...MANAGE_BACK_OFFICE), itemsController.createItem);
router.get('/:id', requireRole(...VIEW_BACK_OFFICE), itemsController.getItemById);
router.put('/:id', requireRole(...MANAGE_BACK_OFFICE), itemsController.updateItem);

module.exports = router;
