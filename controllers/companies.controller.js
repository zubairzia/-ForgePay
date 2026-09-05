const localService = require('../services/Companies/localService');

// GET all companies
// NOTE: unrestricted for now — see getAllCompanies in services/Companies/
// localService.js for why this needs to become admin-only once real
// auth/roles exist.
const getCompanies = async (req, res, next) => {
  try {
    const companies = await localService.getAllCompanies();
    res.json(companies);
  } catch (error) {
    next(error);
  }
};

// CREATE company — this is how a tenant is created, so there's no
// tenantId in scope yet (see routes/index.js for why this route sits
// outside tenantMiddleware).
const createCompany = async (req, res, next) => {
  try {
    const company = await localService.createCompany(req.body);
    res.status(201).json(company);
  } catch (error) {
    next(error);
  }
};

// GET single company
const getCompanyById = async (req, res, next) => {
  try {
    const company = await localService.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json(company);
  } catch (error) {
    next(error);
  }
};

// UPDATE company
const updateCompany = async (req, res, next) => {
  try {
    const company = await localService.updateCompany(req.params.id, req.body);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json(company);
  } catch (error) {
    next(error);
  }
};

// Render companies list page
const listCompaniesPage = (req, res) => {
  res.render('companies/index');
};

// Render create-company form
const createCompanyPage = (req, res) => {
  res.render('companies/create');
};

// Create company from the web form, then redirect to the list — no
// tenantId involved anywhere in this path, same as the JSON createCompany
// above (see routes/index.js for why this whole module sits outside
// tenantMiddleware).
const submitCompanyCreate = async (req, res, next) => {
  try {
    await localService.createCompany(req.body);
    res.redirect('/companies');
  } catch (error) {
    next(error);
  }
};

// Render company detail page
const viewCompany = async (req, res, next) => {
  try {
    const company = await localService.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).render('companies/not-found', { companyId: req.params.id });
    }
    res.render('companies/detail', { company });
  } catch (error) {
    next(error);
  }
};

// Render company edit page
const editCompany = async (req, res, next) => {
  try {
    const company = await localService.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).render('companies/not-found', { companyId: req.params.id });
    }
    res.render('companies/edit', { company });
  } catch (error) {
    next(error);
  }
};

// Update company from the web edit form, then redirect back to the detail page
const submitCompanyUpdate = async (req, res, next) => {
  try {
    const id = req.params.id;
    await localService.updateCompany(id, req.body);
    res.redirect(`/companies/${id}/view`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCompanies,
  createCompany,
  getCompanyById,
  updateCompany,
  listCompaniesPage,
  createCompanyPage,
  submitCompanyCreate,
  viewCompany,
  editCompany,
  submitCompanyUpdate,
};
