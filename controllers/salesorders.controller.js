const documentsService = require('../services/Documents/localService');

// Thin wrapper around the shared Documents service — hardcodes
// document_type so this endpoint only ever sees/creates sales orders.
const DOCUMENT_TYPE = 'sales_order';
const NOT_FOUND_MESSAGE = 'Sales order not found';

// GET sales orders
const getSalesOrders = async (req, res, next) => {
  try {
    const salesOrders = await documentsService.getAllDocuments(req.tenantId, DOCUMENT_TYPE);
    res.json(salesOrders);
  } catch (error) {
    next(error);
  }
};

// CREATE sales order
const createSalesOrder = async (req, res, next) => {
  try {
    const salesOrder = await documentsService.createDocument(req.tenantId, DOCUMENT_TYPE, req.body);
    res.status(201).json(salesOrder);
  } catch (error) {
    next(error);
  }
};

// GET single sales order
const getSalesOrderById = async (req, res, next) => {
  try {
    const salesOrder = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!salesOrder || salesOrder.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }
    res.json(salesOrder);
  } catch (error) {
    next(error);
  }
};

// UPDATE sales order (header fields)
const updateSalesOrder = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const salesOrder = await documentsService.updateDocument(req.tenantId, req.params.id, req.body);
    res.json(salesOrder);
  } catch (error) {
    next(error);
  }
};

// UPDATE sales order status
const updateSalesOrderStatus = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const salesOrder = await documentsService.updateDocumentStatus(req.tenantId, req.params.id, req.body.status);
    res.json(salesOrder);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSalesOrders,
  createSalesOrder,
  getSalesOrderById,
  updateSalesOrder,
  updateSalesOrderStatus,
};
