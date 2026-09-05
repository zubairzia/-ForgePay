const db = require('../../db');
const validator = require('validator');

// Local Postgres-backed company (tenant) service, mirroring
// services/Customers/localService.js and services/Vendors/localService.js.
// Unlike those, nothing here is scoped by tenantId — a company IS the
// tenant, so these functions operate on companies.id directly instead of
// filtering by company_id.

// CREATE company — this is how a new tenant comes into existence, so
// there's no tenantId to scope by yet.
const createCompany = async (data) => {
  const name = (data.name || '').trim();
  if (!validator.isLength(name, { min: 1 })) {
    const err = new Error('Company name is required');
    err.status = 400;
    throw err;
  }

  if (data.country && !validator.isISO31661Alpha2(data.country)) {
    const err = new Error('Country must be a valid ISO 3166-1 alpha-2 code (e.g. "US")');
    err.status = 400;
    throw err;
  }

  if (data.currency && !validator.isISO4217(data.currency)) {
    const err = new Error('Currency must be a valid ISO 4217 code (e.g. "USD")');
    err.status = 400;
    throw err;
  }

  // Single INSERT — no transaction needed, unlike createLocalCustomer/
  // createLocalVendor which wrap a duplicate check + insert together.
  const result = await db.query(
    `INSERT INTO companies (
      name, legal_name, industry, country, currency, timezone,
      subscription_plan, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      name,
      data.legalName || null,
      data.industry || null,
      data.country || null,
      data.currency || null,
      data.timezone || null,
      data.subscriptionPlan || 'trial',
      data.status || 'active',
    ]
  );

  return result.rows[0];
};

const getCompanyById = async (id) => {
  const result = await db.query('SELECT * FROM companies WHERE id = $1', [id]);
  return result.rows[0];
};

const updateCompany = async (id, data) => {
  if (data.name !== undefined && !validator.isLength(String(data.name).trim(), { min: 1 })) {
    const err = new Error('Company name cannot be empty');
    err.status = 400;
    throw err;
  }

  if (data.country && !validator.isISO31661Alpha2(data.country)) {
    const err = new Error('Country must be a valid ISO 3166-1 alpha-2 code (e.g. "US")');
    err.status = 400;
    throw err;
  }

  if (data.currency && !validator.isISO4217(data.currency)) {
    const err = new Error('Currency must be a valid ISO 4217 code (e.g. "USD")');
    err.status = 400;
    throw err;
  }

  // COALESCE keeps existing values for any field the caller omits, instead
  // of nulling them out — important here because name/subscription_plan/
  // status are all NOT NULL columns.
  const result = await db.query(
    `UPDATE companies SET
      name              = COALESCE($1, name),
      legal_name        = COALESCE($2, legal_name),
      industry          = COALESCE($3, industry),
      country           = COALESCE($4, country),
      currency          = COALESCE($5, currency),
      timezone          = COALESCE($6, timezone),
      subscription_plan = COALESCE($7, subscription_plan),
      status            = COALESCE($8, status),
      updated_at        = now()
    WHERE id = $9
    RETURNING *`,
    [
      data.name ?? null,
      data.legalName ?? null,
      data.industry ?? null,
      data.country ?? null,
      data.currency ?? null,
      data.timezone ?? null,
      data.subscriptionPlan ?? null,
      data.status ?? null,
      id,
    ]
  );

  return result.rows[0];
};

// GET all — unrestricted for now. Once real auth/roles exist, this needs
// to become admin-only (e.g. a platform-admin role check in the
// controller/middleware): a regular tenant user should never be able to
// list every company in the system, only their own.
const getAllCompanies = async () => {
  const result = await db.query('SELECT * FROM companies ORDER BY created_at DESC');
  return result.rows;
};

module.exports = {
  createCompany,
  getCompanyById,
  updateCompany,
  getAllCompanies,
};
