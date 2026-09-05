const documentsService = require('../services/Documents/localService');

// Thin wrapper around the shared Documents service — hardcodes
// document_type so this endpoint only ever sees/creates purchase orders.
const DOCUMENT_TYPE = 'purchase_order';
const NOT_FOUND_MESSAGE = 'Purchase order not found';

// GET purchase orders
const getPurchaseOrders = async (req, res, next) => {
  try {
    const purchaseOrders = await documentsService.getAllDocuments(req.tenantId, DOCUMENT_TYPE);
    res.json(purchaseOrders);
  } catch (error) {
    next(error);
  }
};

// CREATE purchase order
const createPurchaseOrder = async (req, res, next) => {
  try {
    const purchaseOrder = await documentsService.createDocument(req.tenantId, DOCUMENT_TYPE, req.body);
    res.status(201).json(purchaseOrder);
  } catch (error) {
    next(error);
  }
};

// GET single purchase order
const getPurchaseOrderById = async (req, res, next) => {
  try {
    const purchaseOrder = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!purchaseOrder || purchaseOrder.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }
    res.json(purchaseOrder);
  } catch (error) {
    next(error);
  }
};

// UPDATE purchase order (header fields)
const updatePurchaseOrder = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const purchaseOrder = await documentsService.updateDocument(req.tenantId, req.params.id, req.body);
    res.json(purchaseOrder);
  } catch (error) {
    next(error);
  }
};

// UPDATE purchase order status
const updatePurchaseOrderStatus = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const purchaseOrder = await documentsService.updateDocumentStatus(req.tenantId, req.params.id, req.body.status);
    res.json(purchaseOrder);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPurchaseOrders,
  createPurchaseOrder,
  getPurchaseOrderById,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
};
