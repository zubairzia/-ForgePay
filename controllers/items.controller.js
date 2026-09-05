const localService = require('../services/Items/localService');

// GET items
const getItems = async (req, res, next) => {
  try {
    const items = await localService.getAllLocalItems(req.tenantId);
    res.json(items);
  } catch (error) {
    next(error);
  }
};

// CREATE item
const createItem = async (req, res, next) => {
  try {
    await localService.createLocalItem(req.tenantId, req.body);
    res.redirect('/items');
  } catch (error) {
    next(error);
  }
};

// SEARCH items
const searchItems = async (req, res, next) => {
  try {
    const items = await localService.searchLocalItems(req.tenantId, req.query);
    res.json(items);
  } catch (error) {
    next(error);
  }
};

// GET single item (API)
const getItemById = async (req, res, next) => {
  try {
    const item = await localService.getItemById(req.tenantId, req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    next(error);
  }
};

// UPDATE item (API)
const updateItem = async (req, res, next) => {
  try {
    const item = await localService.updateLocalItem(req.tenantId, req.params.id, req.body);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    next(error);
  }
};

// Render item detail page
const viewItem = async (req, res, next) => {
  try {
    const item = await localService.getItemById(req.tenantId, req.params.id);
    if (!item) {
      return res.status(404).render('items/not-found', { itemId: req.params.id });
    }
    res.render('items/detail', { item });
  } catch (error) {
    next(error);
  }
};

// Render item edit page
const editItem = async (req, res, next) => {
  try {
    const item = await localService.getItemById(req.tenantId, req.params.id);
    if (!item) {
      return res.status(404).render('items/not-found', { itemId: req.params.id });
    }
    res.render('items/edit', { item });
  } catch (error) {
    next(error);
  }
};

// Update item from the web edit form, then redirect back to the detail page
const submitItemUpdate = async (req, res, next) => {
  try {
    const id = req.params.id;
    await localService.updateLocalItem(req.tenantId, id, req.body);
    res.redirect(`/items/${id}/view`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getItems,
  createItem,
  searchItems,
  getItemById,
  updateItem,
  viewItem,
  editItem,
  submitItemUpdate,
};
