const db = require('../../db');
const validator = require('validator');

// Local Postgres-backed company (tenant) service, mirroring
// services/Customers/localService.js and services/Vendors/localService.js.
// Unlike those, nothing here is scoped by tenantId — a company IS the
// tenant, so these functions operate on companies.id directly instead of
// filtering by company_id.

// CREATE company — this is how a new tenant comes into existence, so
// there's no tenantId to scope by yet.
//
// Accepts an optional `client` (a checked-out connection from db.connect())
// so services/Auth/localService.js's registerCompanyAndOwner can run this
// INSERT inside its own BEGIN/COMMIT alongside the owner-user INSERT —
// company creation is no longer reachable on its own (see
// controllers/companies.controller.js), only as part of registration, and
// that whole flow must succeed or fail atomically. Defaults to the pool
// (`db`) for any caller that doesn't need transactional participation.
const createCompany = async (data, client = db) => {
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

  const result = await client.query(
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

const LATE_FEE_TYPES = ['none', 'fixed', 'percentage'];
const LATE_FEE_APPLIES = ['once', 'daily', 'per_period'];

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

  // Scheduled-jobs config (see notes/migration_scheduled_jobs.sql and
  // services/Jobs/dailyStatusUpdate.js, which reads these).
  if (data.gracePeriodDays !== undefined) {
    const days = Number(data.gracePeriodDays);
    if (!Number.isInteger(days) || days < 0) {
      const err = new Error('gracePeriodDays must be a non-negative integer');
      err.status = 400;
      throw err;
    }
  }
  if (data.lateFeeType !== undefined && !LATE_FEE_TYPES.includes(data.lateFeeType)) {
    const err = new Error(`lateFeeType must be one of: ${LATE_FEE_TYPES.join(', ')}`);
    err.status = 400;
    throw err;
  }
  if (data.lateFeeAmount !== undefined) {
    const amount = Number(data.lateFeeAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      const err = new Error('lateFeeAmount must be a non-negative number');
      err.status = 400;
      throw err;
    }
  }
  if (data.lateFeeApplies !== undefined && !LATE_FEE_APPLIES.includes(data.lateFeeApplies)) {
    const err = new Error(`lateFeeApplies must be one of: ${LATE_FEE_APPLIES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  // COALESCE keeps existing values for any field the caller omits, instead
  // of nulling them out — important here because name/subscription_plan/
  // status are all NOT NULL columns.
  const result = await db.query(
    `UPDATE companies SET
      name                = COALESCE($1, name),
      legal_name          = COALESCE($2, legal_name),
      industry            = COALESCE($3, industry),
      country             = COALESCE($4, country),
      currency            = COALESCE($5, currency),
      timezone            = COALESCE($6, timezone),
      subscription_plan   = COALESCE($7, subscription_plan),
      status              = COALESCE($8, status),
      grace_period_days   = COALESCE($9, grace_period_days),
      late_fee_type       = COALESCE($10, late_fee_type),
      late_fee_amount     = COALESCE($11, late_fee_amount),
      late_fee_applies    = COALESCE($12, late_fee_applies),
      updated_at          = now()
    WHERE id = $13
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
      data.gracePeriodDays ?? null,
      data.lateFeeType ?? null,
      data.lateFeeAmount ?? null,
      data.lateFeeApplies ?? null,
      id,
    ]
  );

  return result.rows[0];
};

module.exports = {
  createCompany,
  getCompanyById,
  updateCompany,
};
