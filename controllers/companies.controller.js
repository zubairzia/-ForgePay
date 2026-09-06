const localService = require('../services/Companies/localService');

// Company creation only happens through registration now
// (services/Auth/localService.js's registerCompanyAndOwner) — there is no
// standalone "create a company" endpoint left. Every function below
// operates on the CALLER'S OWN company (req.tenantId) only; a user must
// never be able to view or edit another tenant's company profile just by
// guessing/incrementing an id in the URL.
const isOwnCompany = (req) => Number(req.params.id) === Number(req.tenantId);

// GET single company (JSON) — own company only.
const getCompanyById = async (req, res, next) => {
  try {
    if (!isOwnCompany(req)) {
      return res.status(404).json({ message: 'Company not found' });
    }
    const company = await localService.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json(company);
  } catch (error) {
    next(error);
  }
};

// UPDATE company (JSON) — own company only.
const updateCompany = async (req, res, next) => {
  try {
    if (!isOwnCompany(req)) {
      return res.status(404).json({ message: 'Company not found' });
    }
    const company = await localService.updateCompany(req.params.id, req.body);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json(company);
  } catch (error) {
    next(error);
  }
};

// There is no "list companies" page anymore — a tenant only ever has one
// company, its own. Redirect straight to it.
const listCompaniesPage = (req, res) => {
  res.redirect(`/companies/${req.tenantId}/view`);
};

// Render company detail page — own company only.
const viewCompany = async (req, res, next) => {
  try {
    if (!isOwnCompany(req)) {
      return res.status(404).render('companies/not-found', { companyId: req.params.id });
    }
    const company = await localService.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).render('companies/not-found', { companyId: req.params.id });
    }
    res.render('companies/detail', { company });
  } catch (error) {
    next(error);
  }
};

// Render company edit page — own company only.
const editCompany = async (req, res, next) => {
  try {
    if (!isOwnCompany(req)) {
      return res.status(404).render('companies/not-found', { companyId: req.params.id });
    }
    const company = await localService.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).render('companies/not-found', { companyId: req.params.id });
    }
    res.render('companies/edit', { company });
  } catch (error) {
    next(error);
  }
};

// Update company from the web edit form — own company only.
const submitCompanyUpdate = async (req, res, next) => {
  try {
    if (!isOwnCompany(req)) {
      return res.status(404).render('companies/not-found', { companyId: req.params.id });
    }
    const id = req.params.id;
    await localService.updateCompany(id, req.body);
    res.redirect(`/companies/${id}/view`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCompanyById,
  updateCompany,
  listCompaniesPage,
  viewCompany,
  editCompany,
  submitCompanyUpdate,
};
