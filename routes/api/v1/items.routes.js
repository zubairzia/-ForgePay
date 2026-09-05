const express = require('express');
const router = express.Router();
const itemsController = require('../../../controllers/items.controller');

router.get('/', itemsController.getItems);
router.get('/search', itemsController.searchItems);
router.post('/', itemsController.createItem);
router.get('/:id', itemsController.getItemById);
router.put('/:id', itemsController.updateItem);

module.exports = router;
