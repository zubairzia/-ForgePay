const db = require('../../db');
const validator = require('validator');

// Local Postgres-backed vendor service, mirroring services/Customers/localService.js.
// Assumes a `vendors` table shaped like `customers` (see notes/migration_vendors.sql).
// Nothing here calls any external API — this is the "own the data" replacement
// for what used to be Zoho contact calls.

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

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (email) {
      const duplicate = await client.query(
        'SELECT vendor_code FROM vendors WHERE company_id = $1 AND email = $2',
        [tenantId, email]
      );
      if (duplicate.rows.length > 0) {
        const err = new Error('Vendor already exists');
        err.status = 409;
        throw err;
      }
    }

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
    throw err;
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

module.exports = {
  getAllLocalVendors,
  createLocalVendor,
  searchLocalVendors,
  getVendorById,
};
