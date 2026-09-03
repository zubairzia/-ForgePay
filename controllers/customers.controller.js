const localService = require('../services/Customers/localService');

// GET customers
const getCustomers = async (req, res, next) => {
  try {
    const customers = await localService.getAllLocalCustomers(req.tenantId);
    res.json(customers);
  } catch (error) {
    next(error);
  }
};

// CREATE customer
const createCustomer = async (req, res, next) => {
  try {
    await localService.createLocalCustomer(req.tenantId, req.body);
    res.redirect('/customers');
  } catch (error) {
    next(error);
  }
};

// SEARCH customers
const searchCustomers = async (req, res, next) => {
  try {
    const customers = await localService.searchLocalCustomers(req.tenantId, req.query);
    res.json(customers);
  } catch (error) {
    next(error);
  }
};

// GET single customer
const getCustomerById = async (req, res, next) => {
  try {
    const customer = await localService.getCustomerById(req.tenantId, req.params.customer_code);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    next(error);
  }
};

// Render customer detail page
const viewCustomer = async (req, res, next) => {
  try {
    const customer = await localService.getCustomerById(req.tenantId, req.params.customer_code);
    if (!customer) {
      return res.status(404).render('customers/not-found', { customerCode: req.params.customer_code });
    }
    res.render('customers/detail', { customer });
  } catch (error) {
    next(error);
  }
};

// Render customer edit page
const editCustomer = async (req, res, next) => {
  try {
    const customer = await localService.getCustomerById(req.tenantId, req.params.customer_code);
    if (!customer) {
      return res.status(404).render('customers/not-found', { customerCode: req.params.customer_code });
    }
    res.render('customers/edit', { customer });
  } catch (error) {
    next(error);
  }
};

// Update customer API
const updateCustomer = async (req, res, next) => {
  try {
    const id = req.params.customer_code;
    await localService.updateLocalCustomer(req.tenantId, id, req.body);
    res.redirect(`/customers/${id}/view`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomers,
  createCustomer,
  searchCustomers,
  getCustomerById,
  viewCustomer,
  editCustomer,
  updateCustomer,
};
