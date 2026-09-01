const db = require('../../db');
const validator = require('validator');

// GET all — now scoped to a tenant instead of returning every tenant's rows
const getAllLocalCustomers = async (tenantId) => {
  const result = await db.query(
    'SELECT * FROM customers WHERE company_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows;
};

// CREATE customer
const createLocalCustomer = async (tenantId, data) => {
  const { email } = data;

  if (!email || !validator.isEmail(email)) {
    const err = new Error('Invalid email address');
    err.status = 400;
    throw err;
  }

  // Wrap in a transaction: the duplicate check + insert should be atomic.
  // Better still, add a UNIQUE (company_id, email) constraint at the DB
  // level (see notes below) and catch the 23505 error — the app-level
  // check alone still has a race window between two concurrent requests.
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const duplicate = await client.query(
      'SELECT customer_code FROM customers WHERE company_id = $1 AND email = $2',
      [tenantId, email]
    );
    if (duplicate.rows.length > 0) {
      const err = new Error('Customer already exists');
      err.status = 409;
      throw err;
    }

    const result = await client.query(
      `INSERT INTO customers (
        company_id, first_name, last_name, company_name, display_name,
        email, phone, mobile, website,
        billing_street, billing_city, billing_state, billing_postal_code, billing_country,
        shipping_street, shipping_city, shipping_state, shipping_postal_code, shipping_country,
        tax_number, tax_id, credit_limit, currency, is_taxable,
        status, customer_type, source, notes, tags
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29
      ) RETURNING *`,
      [
        tenantId,
        data.firstName, data.lastName, data.companyName, data.displayName,
        data.email, data.phone, data.mobile, data.website,
        data.billingStreet, data.billingCity, data.billingState, data.billingPostalCode, data.billingCountry,
        data.shippingStreet, data.shippingCity, data.shippingState, data.shippingPostalCode, data.shippingCountry,
        data.taxNumber, data.taxid, data.creditLimit || null, data.currency, data.IsTaxable,
        data.status, data.customerType, data.source, data.notes, data.tags,
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

const searchLocalCustomers = async (tenantId, query) => {
  const q = query.query || '';

  const result = await db.query(
    `SELECT *
     FROM customers
     WHERE company_id = $1
       AND (
         first_name ILIKE $2
         OR last_name ILIKE $2
         OR company_name ILIKE $2
         OR email ILIKE $2
         OR phone ILIKE $2
         OR customer_code ILIKE $2
       )
     ORDER BY created_at DESC`,
    [tenantId, `%${q}%`]
  );

  return result.rows;
};

const getCustomerById = async (tenantId, id) => {
  const result = await db.query(
    `SELECT * FROM customers WHERE company_id = $1 AND customer_code = $2`,
    [tenantId, id]
  );

  return result.rows[0];
};

const updateLocalCustomer = async (tenantId, id, data) => {
  if (data.email && !validator.isEmail(data.email)) {
    const err = new Error('Invalid email address');
    err.status = 400;
    throw err;
  }

  const result = await db.query(
    `UPDATE customers SET
      first_name = $1, last_name = $2, company_name = $3, display_name = $4,
      email = $5, phone = $6, mobile = $7, website = $8,
      billing_street = $9, billing_city = $10, billing_state = $11, billing_postal_code = $12, billing_country = $13,
      shipping_street = $14, shipping_city = $15, shipping_state = $16, shipping_postal_code = $17, shipping_country = $18,
      tax_number = $19, credit_limit = $20, currency = $21, tax_id = $22, is_taxable = $23,
      status = $24, customer_type = $25, source = $26, notes = $27, tags = $28
    WHERE company_id = $29 AND customer_code = $30
    RETURNING *`,
    [
      data.firstName, data.lastName, data.companyName, data.displayName,
      data.email, data.phone, data.mobile, data.website,
      data.billingStreet, data.billingCity, data.billingState, data.billingPostalCode, data.billingCountry,
      data.shippingStreet, data.shippingCity, data.shippingState, data.shippingPostalCode, data.shippingCountry,
      data.taxNumber, data.creditLimit || null, data.currency, data.taxid, data.IsTaxable,
      data.status, data.customerType, data.source, data.notes, data.tags,
      tenantId, id,
    ]
  );

  return result.rows[0];
};

module.exports = {
  getAllLocalCustomers,
  createLocalCustomer,
  searchLocalCustomers,
  getCustomerById,
  updateLocalCustomer,
};
