const express = require('express');
const router = express.Router();

const itemsController = require('../../controllers/items.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../middleware/roleGroups');

// Item Pages
router.get('/items', requireRole(...VIEW_BACK_OFFICE), (req, res) => {
  res.render('items/index');
});

router.get('/items/create', requireRole(...MANAGE_BACK_OFFICE), (req, res) => {
  res.render('items/create');
});

router.post('/items/create', requireRole(...MANAGE_BACK_OFFICE), itemsController.createItem);

router.get('/items/:id/view', requireRole(...VIEW_BACK_OFFICE), itemsController.viewItem);

router.get('/items/:id/edit', requireRole(...MANAGE_BACK_OFFICE), itemsController.editItem);

router.post('/items/:id/update', requireRole(...MANAGE_BACK_OFFICE), itemsController.submitItemUpdate);

module.exports = router;
