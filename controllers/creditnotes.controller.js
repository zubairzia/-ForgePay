const documentsService = require('../services/Documents/localService');

// Thin wrapper around the shared Documents service — hardcodes
// document_type so this endpoint only ever sees/creates credit notes.
// Unlike the other five types, credit_note's direction isn't fixed (a
// credit can apply against a customer invoice OR a vendor bill), so the
// caller must include `direction: 'sales' | 'purchase'` in the request
// body — the Documents service validates that explicitly.
const DOCUMENT_TYPE = 'credit_note';
const NOT_FOUND_MESSAGE = 'Credit note not found';

// GET credit notes
const getCreditNotes = async (req, res, next) => {
  try {
    const creditNotes = await documentsService.getAllDocuments(req.tenantId, DOCUMENT_TYPE);
    res.json(creditNotes);
  } catch (error) {
    next(error);
  }
};

// CREATE credit note
const createCreditNote = async (req, res, next) => {
  try {
    const creditNote = await documentsService.createDocument(req.tenantId, DOCUMENT_TYPE, { ...req.body, createdBy: req.user.id });
    res.status(201).json(creditNote);
  } catch (error) {
    next(error);
  }
};

// GET single credit note
const getCreditNoteById = async (req, res, next) => {
  try {
    const creditNote = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!creditNote || creditNote.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }
    res.json(creditNote);
  } catch (error) {
    next(error);
  }
};

// UPDATE credit note (header fields)
const updateCreditNote = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const creditNote = await documentsService.updateDocument(req.tenantId, req.params.id, req.body);
    res.json(creditNote);
  } catch (error) {
    next(error);
  }
};

// UPDATE credit note status
const updateCreditNoteStatus = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const creditNote = await documentsService.updateDocumentStatus(req.tenantId, req.params.id, req.body.status);
    res.json(creditNote);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCreditNotes,
  createCreditNote,
  getCreditNoteById,
  updateCreditNote,
  updateCreditNoteStatus,
};
