const documentsService = require('../services/Documents/localService');

// Thin wrapper around the shared Documents service — hardcodes
// document_type so this endpoint only ever sees/creates bills.
const DOCUMENT_TYPE = 'bill';
const NOT_FOUND_MESSAGE = 'Bill not found';

// GET bills
const getBills = async (req, res, next) => {
  try {
    const bills = await documentsService.getAllDocuments(req.tenantId, DOCUMENT_TYPE);
    res.json(bills);
  } catch (error) {
    next(error);
  }
};

// CREATE bill
const createBill = async (req, res, next) => {
  try {
    const bill = await documentsService.createDocument(req.tenantId, DOCUMENT_TYPE, { ...req.body, createdBy: req.user.id });
    res.status(201).json(bill);
  } catch (error) {
    next(error);
  }
};

// GET single bill
const getBillById = async (req, res, next) => {
  try {
    const bill = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!bill || bill.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }
    res.json(bill);
  } catch (error) {
    next(error);
  }
};

// UPDATE bill (header fields)
const updateBill = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const bill = await documentsService.updateDocument(req.tenantId, req.params.id, req.body);
    res.json(bill);
  } catch (error) {
    next(error);
  }
};

// UPDATE bill status
const updateBillStatus = async (req, res, next) => {
  try {
    const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
    if (!existing || existing.document_type !== DOCUMENT_TYPE) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const bill = await documentsService.updateDocumentStatus(req.tenantId, req.params.id, req.body.status);
    res.json(bill);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBills,
  createBill,
  getBillById,
  updateBill,
  updateBillStatus,
};
