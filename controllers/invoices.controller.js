const documentsService = require('../services/Documents/localService');

// Thin wrapper around the shared Documents service — hardcodes
// document_type so this endpoint only ever sees/creates invoices.
const DOCUMENT_TYPE = 'invoice';
const NOT_FOUND_MESSAGE = 'Invoice not found';

// GET invoices
const getInvoices = async (req, res, next) => {
  try {
    const invoices = await documentsService.getAllDocuments(req.tenantId, DOCUMENT_TYPE);
    res.json(invoices);
  } catch (error) {
    next(error);
  }
};

// CREATE invoice
const createInvoice = async (req, res, next) => {
  try {
    const invoice = await documentsService.createDocument(req.tenantId, DOCUMENT_TYPE, req.body);
    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
};

// GET single invoice
const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!invoice || invoice.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }
    res.json(invoice);
  } catch (error) {
    next(error);
  }
};

// UPDATE invoice (header fields)
const updateInvoice = async (req, res, next) => {
  try {
    // Documents is a single shared table across all six types, so ids
    // aren't scoped per type — check the existing row's type first to
    // avoid this endpoint editing a document created as a different type.
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const invoice = await documentsService.updateDocument(req.tenantId, req.params.id, req.body);
    res.json(invoice);
  } catch (error) {
    next(error);
  }
};

// UPDATE invoice status
const updateInvoiceStatus = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const invoice = await documentsService.updateDocumentStatus(req.tenantId, req.params.id, req.body.status);
    res.json(invoice);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInvoices,
  createInvoice,
  getInvoiceById,
  updateInvoice,
  updateInvoiceStatus,
};
