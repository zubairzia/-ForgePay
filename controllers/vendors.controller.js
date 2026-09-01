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

module.exports = { getVendors, createVendor, searchVendors, getVendorById };
