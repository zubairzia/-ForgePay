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
    const item = await localService.createLocalItem(req.tenantId, req.body);
    res.status(201).json(item);
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

// GET single item
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

// UPDATE item
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

module.exports = {
  getItems,
  createItem,
  searchItems,
  getItemById,
  updateItem,
};
