const express = require('express');
const router = express.Router();

const itemsController = require('../../controllers/items.controller');

// Item Pages
router.get('/items', (req, res) => {
  res.render('items/index');
});

router.get('/items/create', (req, res) => {
  res.render('items/create');
});

// Create form posts here directly (web layer), same reasoning as
// vendors.web.js — avoids needing a custom header a plain <form> can't send.
router.post('/items/create', itemsController.createItem);

router.get('/items/:id/view', itemsController.viewItem);

router.get('/items/:id/edit', itemsController.editItem);

router.post('/items/:id/update', itemsController.submitItemUpdate);

module.exports = router;
