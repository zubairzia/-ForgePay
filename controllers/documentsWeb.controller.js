const documentsService = require('../services/Documents/localService');
const customersService = require('../services/Customers/localService');
const vendorsService = require('../services/Vendors/localService');
const itemsService = require('../services/Items/localService');

// ONE shared web controller behind all six document types, mirroring
// services/Documents/localService.js's own "one implementation, six thin
// wrappers" pattern — each routes/web/<type>.web.js file just calls
// createDocumentWebController(documentType, meta) and wires the result up
// to its own URL prefix. Nothing here is type-specific except the `meta`
// object each caller passes in.

const FIXED_DIRECTION_BY_TYPE = {
  invoice: 'sales',
  bill: 'purchase',
  // credit_note has no fixed direction — the create form lets the user
  // choose, matching services/Documents/localService.js.
};

function createDocumentWebController(documentType, meta) {
  const notFoundView = () => ({ view: 'documents/not-found', locals: { documentType, meta } });

  // GET list page
  const list = async (req, res, next) => {
    try {
      const documents = await documentsService.getAllDocuments(req.tenantId, documentType);

      // Resolve customer/vendor names for display without a SQL join —
      // documents only stores customer_id/vendor_id.
      const [customers, vendors] = await Promise.all([
        customersService.getAllLocalCustomers(req.tenantId),
        vendorsService.getAllLocalVendors(req.tenantId),
      ]);
      const customerNameById = new Map(customers.map(c => [c.id, c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()]));
      const vendorNameById = new Map(vendors.map(v => [v.id, v.company_name || `${v.first_name || ''} ${v.last_name || ''}`.trim()]));

      const documentsWithParty = documents.map(doc => ({
        ...doc,
        party_name: doc.customer_id ? customerNameById.get(doc.customer_id) : vendorNameById.get(doc.vendor_id),
      }));

      res.render('documents/list', { documentType, meta, documents: documentsWithParty });
    } catch (error) {
      next(error);
    }
  };

  // GET create form
  const createForm = async (req, res, next) => {
    try {
      const fixedDirection = FIXED_DIRECTION_BY_TYPE[documentType];
      const [customers, vendors, items] = await Promise.all([
        (!fixedDirection || fixedDirection === 'sales') ? customersService.getAllLocalCustomers(req.tenantId) : [],
        (!fixedDirection || fixedDirection === 'purchase') ? vendorsService.getAllLocalVendors(req.tenantId) : [],
        itemsService.getAllLocalItems(req.tenantId),
      ]);

      res.render('documents/create', {
        documentType, meta, fixedDirection, customers, vendors, items,
      });
    } catch (error) {
      next(error);
    }
  };

  // POST create — redirect to the new document's detail page on success.
  const submitCreate = async (req, res, next) => {
    try {
      const document = await documentsService.createDocument(req.tenantId, documentType, { ...req.body, createdBy: req.user.id });
      res.redirect(`${meta.basePath}/${document.id}/view`);
    } catch (error) {
      next(error);
    }
  };

  // GET detail page
  const view = async (req, res, next) => {
    try {
      const document = await documentsService.getDocumentById(req.tenantId, req.params.id);
      if (!document || document.document_type !== documentType) {
        const nf = notFoundView();
        return res.status(404).render(nf.view, { ...nf.locals, documentId: req.params.id });
      }

      // customersService/vendorsService only look up by their public code
      // (customer_code/vendor_code), not the numeric id documents store —
      // so resolve the party name via the full list, same as list() above.
      const [items, customers, vendors] = await Promise.all([
        itemsService.getAllLocalItems(req.tenantId),
        document.customer_id ? customersService.getAllLocalCustomers(req.tenantId) : [],
        document.vendor_id ? vendorsService.getAllLocalVendors(req.tenantId) : [],
      ]);
      const itemNameById = new Map(items.map(i => [i.id, i.name]));
      const lines = document.lines.map(line => ({ ...line, item_name: line.item_id ? itemNameById.get(line.item_id) : null }));

      const party = document.customer_id
        ? customers.find(c => c.id === document.customer_id)
        : vendors.find(v => v.id === document.vendor_id);
      const partyName = party
        ? (party.company_name || `${party.first_name || ''} ${party.last_name || ''}`.trim())
        : null;

      const allowedNextStatuses = documentsService.ALLOWED_STATUS_TRANSITIONS[document.status] || [];

      res.render('documents/view', {
        documentType, meta, document: { ...document, lines }, partyName, allowedNextStatuses,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET edit form (header fields always; line items only if still draft)
  const editForm = async (req, res, next) => {
    try {
      const document = await documentsService.getDocumentById(req.tenantId, req.params.id);
      if (!document || document.document_type !== documentType) {
        const nf = notFoundView();
        return res.status(404).render(nf.view, { ...nf.locals, documentId: req.params.id });
      }

      const items = await itemsService.getAllLocalItems(req.tenantId);

      res.render('documents/edit', { documentType, meta, document, items });
    } catch (error) {
      next(error);
    }
  };

  // POST update — header fields always; lines only while still draft (see
  // updateDocumentLines for why). Both calls are independent/atomic on
  // their own; if the header update succeeds but the lines update fails,
  // the header change still stands and the user can resubmit lines.
  const submitUpdate = async (req, res, next) => {
    try {
      const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
      if (!existing || existing.document_type !== documentType) {
        const nf = notFoundView();
        return res.status(404).render(nf.view, { ...nf.locals, documentId: req.params.id });
      }

      await documentsService.updateDocument(req.tenantId, req.params.id, req.body);

      if (existing.status === 'draft' && Array.isArray(req.body.lines)) {
        await documentsService.updateDocumentLines(req.tenantId, req.params.id, req.body.lines);
      }

      res.redirect(`${meta.basePath}/${req.params.id}/view`);
    } catch (error) {
      next(error);
    }
  };

  // POST status change from the detail page.
  const submitStatus = async (req, res, next) => {
    try {
      const existing = await documentsService.getDocumentById(req.tenantId, req.params.id);
      if (!existing || existing.document_type !== documentType) {
        const nf = notFoundView();
        return res.status(404).render(nf.view, { ...nf.locals, documentId: req.params.id });
      }

      await documentsService.updateDocumentStatus(req.tenantId, req.params.id, req.body.status);
      res.redirect(`${meta.basePath}/${req.params.id}/view`);
    } catch (error) {
      next(error);
    }
  };

  return { list, createForm, submitCreate, view, editForm, submitUpdate, submitStatus };
}

module.exports = { createDocumentWebController };
