const localService = require('../services/Vendors/localService');

const getVendors = async (req, res, next) => {
  try {
    const vendors = await localService.getAllLocalVendors(req.tenantId);
    res.json(vendors);
  } catch (error) {
    next(error);
  }
};

const createVendor = async (req, res, next) => {
  try {
    await localService.createLocalVendor(req.tenantId, req.body);
    res.redirect('/vendors');
  } catch (error) {
    next(error);
  }
};

const searchVendors = async (req, res, next) => {
  try {
    const vendors = await localService.searchLocalVendors(req.tenantId, req.query);
    res.json(vendors);
  } catch (error) {
    next(error);
  }
};

const getVendorById = async (req, res, next) => {
  try {
    const vendor = await localService.getVendorById(req.tenantId, req.params.vendor_code);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json(vendor);
  } catch (error) {
    next(error);
  }
};

// UPDATE vendor API
const updateVendor = async (req, res, next) => {
  try {
    const vendor = await localService.updateLocalVendor(req.tenantId, req.params.vendor_code, req.body);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json(vendor);
  } catch (error) {
    next(error);
  }
};

// Render vendor detail page
const viewVendor = async (req, res, next) => {
  try {
    const vendor = await localService.getVendorById(req.tenantId, req.params.vendor_code);
    if (!vendor) {
      return res.status(404).render('vendors/not-found', { vendorCode: req.params.vendor_code });
    }
    res.render('vendors/detail', { vendor });
  } catch (error) {
    next(error);
  }
};

// Render vendor edit page
const editVendor = async (req, res, next) => {
  try {
    const vendor = await localService.getVendorById(req.tenantId, req.params.vendor_code);
    if (!vendor) {
      return res.status(404).render('vendors/not-found', { vendorCode: req.params.vendor_code });
    }
    res.render('vendors/edit', { vendor });
  } catch (error) {
    next(error);
  }
};

// Update vendor from the web edit form, then redirect back to the detail
// page — same shape as customers.controller.js's updateCustomer.
const submitVendorUpdate = async (req, res, next) => {
  try {
    const id = req.params.vendor_code;
    await localService.updateLocalVendor(req.tenantId, id, req.body);
    res.redirect(`/vendors/${id}/view`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getVendors,
  createVendor,
  searchVendors,
  getVendorById,
  updateVendor,
  viewVendor,
  editVendor,
  submitVendorUpdate,
};
