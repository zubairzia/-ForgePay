const db = require('../../db');
const validator = require('validator');

// Local Postgres-backed vendor service, mirroring services/Customers/localService.js.
// Assumes a `vendors` table shaped like `customers` (see notes/migration_vendors.sql).
// Nothing here calls any external API — this is the "own the data" replacement
// for what used to be Zoho contact calls.

// Identity fields that must be unique per tenant. Mirrors
// notes/migration_vendor_identity_uniqueness.sql's partial unique indexes
// (uq_vendors_company_email/_tax_number/_tax_id) — each maps a Postgres
// constraint/index name to the column it backs and a human label, so a raw
// 23505 unique_violation can be translated into the same clean,
// field-specific message the app-level pre-check throws. Same pattern as
// services/Customers/localService.js's IDENTITY_UNIQUE_FIELDS.
const IDENTITY_UNIQUE_FIELDS = [
  { column: 'email', dataKey: 'email', label: 'email address', indexName: 'uq_vendors_company_email' },
  { column: 'tax_number', dataKey: 'taxNumber', label: 'tax number', indexName: 'uq_vendors_company_tax_number' },
  { column: 'tax_id', dataKey: 'taxid', label: 'tax ID', indexName: 'uq_vendors_company_tax_id' },
];

// App-level pre-check for all three unique-per-tenant identity fields, run
// inside the caller's transaction so the check and the write stay atomic.
// Skips any field that's blank. excludeVendorId lets updateLocalVendor
// check without tripping over the row being edited.
const checkDuplicateIdentityFields = async (client, tenantId, values, excludeVendorId) => {
  for (const { column, dataKey, label } of IDENTITY_UNIQUE_FIELDS) {
    const value = values[dataKey];
    if (value === undefined || value === null || value === '') continue;

    const params = [tenantId, value];
    let query = `SELECT id FROM vendors WHERE company_id = $1 AND ${column} = $2`;
    if (excludeVendorId !== undefined) {
      params.push(excludeVendorId);
      query += ' AND id <> $3';
    }

    const duplicate = await client.query(query, params);
    if (duplicate.rows.length > 0) {
      const err = new Error(`A vendor with this ${label} already exists`);
      err.status = 409;
      throw err;
    }
  }
};

// Backstop for the race window between the pre-check above and the actual
// INSERT/UPDATE — translates a raw Postgres unique_violation into the same
// clean, field-specific message rather than letting the constraint error
// reach the user.
const translateUniqueViolation = (err) => {
  if (err.code === '23505' && err.constraint) {
    const field = IDENTITY_UNIQUE_FIELDS.find((f) => f.indexName === err.constraint);
    if (field) {
      const friendly = new Error(`A vendor with this ${field.label} already exists`);
      friendly.status = 409;
      return friendly;
    }
  }
  return err;
};

const getAllLocalVendors = async (tenantId) => {
  const result = await db.query(
    'SELECT * FROM vendors WHERE company_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows;
};

const createLocalVendor = async (tenantId, data) => {
  const { email } = data;

  if (email && !validator.isEmail(email)) {
    const err = new Error('Invalid email address');
    err.status = 400;
    throw err;
  }

  // Wrap in a transaction: the duplicate check + insert should be atomic.
  // The partial unique indexes (see
  // notes/migration_vendor_identity_uniqueness.sql) are the backstop for
  // the remaining race window between two concurrent requests — caught
  // below via translateUniqueViolation.
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await checkDuplicateIdentityFields(client, tenantId, data);

    const result = await client.query(
      `INSERT INTO vendors (
        company_id, first_name, last_name, company_name, display_name,
        email, phone, mobile, website,
        billing_street, billing_city, billing_state, billing_postal_code, billing_country,
        tax_number, tax_id, currency, is_taxable,
        status, source, notes, tags
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      ) RETURNING *`,
      [
        tenantId,
        data.firstName, data.lastName, data.companyName, data.displayName,
        data.email, data.phone, data.mobile, data.website,
        data.billingStreet, data.billingCity, data.billingState, data.billingPostalCode, data.billingCountry,
        data.taxNumber, data.taxid, data.currency, data.IsTaxable,
        data.status, data.source, data.notes, data.tags,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw translateUniqueViolation(err);
  } finally {
    client.release();
  }
};

const searchLocalVendors = async (tenantId, query) => {
  const q = query.query || '';
  const result = await db.query(
    `SELECT * FROM vendors
     WHERE company_id = $1
       AND (first_name ILIKE $2 OR last_name ILIKE $2 OR company_name ILIKE $2
            OR email ILIKE $2 OR phone ILIKE $2 OR vendor_code ILIKE $2)
     ORDER BY created_at DESC`,
    [tenantId, `%${q}%`]
  );
  return result.rows;
};

const getVendorById = async (tenantId, id) => {
  const result = await db.query(
    'SELECT * FROM vendors WHERE company_id = $1 AND vendor_code = $2',
    [tenantId, id]
  );
  return result.rows[0];
};

const updateLocalVendor = async (tenantId, id, data) => {
  if (data.email && !validator.isEmail(data.email)) {
    const err = new Error('Invalid email address');
    err.status = 400;
    throw err;
  }

  // Wrapped in a transaction like createLocalVendor: the existing-row
  // fetch, duplicate pre-check, and UPDATE must all see a consistent
  // snapshot, and FOR UPDATE closes the race window where a concurrent
  // edit changes the row out from under this one. Same fix as
  // updateLocalCustomer, which previously had none of this — a raw
  // unique_violation on email would reach the user as an unhandled stack
  // trace instead of a clean 409.
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM vendors WHERE company_id = $1 AND vendor_code = $2 FOR UPDATE',
      [tenantId, id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return undefined;
    }
    const current = existing.rows[0];

    // Same identity-uniqueness rules as create, excluding this row itself.
    await checkDuplicateIdentityFields(client, tenantId, data, current.id);

    // COALESCE keeps existing values for any field the caller omits, rather
    // than nulling them out.
    const result = await client.query(
      `UPDATE vendors SET
        first_name          = COALESCE($1, first_name),
        last_name           = COALESCE($2, last_name),
        company_name        = COALESCE($3, company_name),
        display_name        = COALESCE($4, display_name),
        email               = COALESCE($5, email),
        phone               = COALESCE($6, phone),
        mobile              = COALESCE($7, mobile),
        website              = COALESCE($8, website),
        billing_street      = COALESCE($9, billing_street),
        billing_city        = COALESCE($10, billing_city),
        billing_state       = COALESCE($11, billing_state),
        billing_postal_code = COALESCE($12, billing_postal_code),
        billing_country     = COALESCE($13, billing_country),
        tax_number          = COALESCE($14, tax_number),
        tax_id              = COALESCE($15, tax_id),
        currency            = COALESCE($16, currency),
        is_taxable          = COALESCE($17, is_taxable),
        status              = COALESCE($18, status),
        source              = COALESCE($19, source),
        notes               = COALESCE($20, notes),
        tags                = COALESCE($21, tags),
        updated_at          = now()
      WHERE company_id = $22 AND vendor_code = $23
      RETURNING *`,
      [
        data.firstName ?? null, data.lastName ?? null, data.companyName ?? null, data.displayName ?? null,
        data.email ?? null, data.phone ?? null, data.mobile ?? null, data.website ?? null,
        data.billingStreet ?? null, data.billingCity ?? null, data.billingState ?? null,
        data.billingPostalCode ?? null, data.billingCountry ?? null,
        data.taxNumber ?? null, data.taxid ?? null, data.currency ?? null, data.IsTaxable ?? null,
        data.status ?? null, data.source ?? null, data.notes ?? null, data.tags ?? null,
        tenantId, id,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw translateUniqueViolation(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getAllLocalVendors,
  createLocalVendor,
  searchLocalVendors,
  getVendorById,
  updateLocalVendor,
};
