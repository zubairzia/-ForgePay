const documentsService = require('../services/Documents/localService');

// Thin wrapper around the shared Documents service — hardcodes
// document_type so this endpoint only ever sees/creates quotes.
const DOCUMENT_TYPE = 'quote';
const NOT_FOUND_MESSAGE = 'Quote not found';

// GET quotes
const getQuotes = async (req, res, next) => {
  try {
    const quotes = await documentsService.getAllDocuments(req.tenantId, DOCUMENT_TYPE);
    res.json(quotes);
  } catch (error) {
    next(error);
  }
};

// CREATE quote
const createQuote = async (req, res, next) => {
  try {
    const quote = await documentsService.createDocument(req.tenantId, DOCUMENT_TYPE, req.body);
    res.status(201).json(quote);
  } catch (error) {
    next(error);
  }
};

// GET single quote
const getQuoteById = async (req, res, next) => {
  try {
    const quote = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!quote || quote.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }
    res.json(quote);
  } catch (error) {
    next(error);
  }
};

// UPDATE quote (header fields)
const updateQuote = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const quote = await documentsService.updateDocument(req.tenantId, req.params.id, req.body);
    res.json(quote);
  } catch (error) {
    next(error);
  }
};

// UPDATE quote status
const updateQuoteStatus = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const quote = await documentsService.updateDocumentStatus(req.tenantId, req.params.id, req.body.status);
    res.json(quote);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getQuotes,
  createQuote,
  getQuoteById,
  updateQuote,
  updateQuoteStatus,
};
