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

// Shared by createLocalCustomer and updateLocalCustomer: validates the
// lending-specific fields added in migration_customers_lending_fields.sql.
// national_id/guarantor_national_id are checked for non-empty only, not
// format-locked — formats differ across GCC countries (CNIC, Iqama, Saudi
// national ID, etc.).
const validateLendingFields = (data) => {
  if (data.nationalId !== undefined && data.nationalId !== null && data.nationalId !== '' &&
      !validator.isLength(String(data.nationalId).trim(), { min: 1 })) {
    const err = new Error('nationalId cannot be blank if provided');
    err.status = 400;
    throw err;
  }

  if (data.guarantorNationalId !== undefined && data.guarantorNationalId !== null && data.guarantorNationalId !== '' &&
      !validator.isLength(String(data.guarantorNationalId).trim(), { min: 1 })) {
    const err = new Error('guarantorNationalId cannot be blank if provided');
    err.status = 400;
    throw err;
  }

  if (data.dateOfBirth) {
    if (!validator.isISO8601(String(data.dateOfBirth))) {
      const err = new Error('dateOfBirth must be a valid date (YYYY-MM-DD)');
      err.status = 400;
      throw err;
    }
    if (new Date(data.dateOfBirth) >= new Date()) {
      const err = new Error('dateOfBirth must be in the past');
      err.status = 400;
      throw err;
    }
  }

  if (data.creditScore !== undefined && data.creditScore !== null && data.creditScore !== '') {
    const creditScore = Number(data.creditScore);
    if (!Number.isInteger(creditScore) || creditScore <= 0) {
      const err = new Error('creditScore must be a positive integer');
      err.status = 400;
      throw err;
    }
  }
};

// metadata can arrive two shapes: a raw JSON string (an HTML <textarea>
// can only ever send text) or an already-parsed object (an API caller
// posting JSON directly). Either way this returns the exact text to hand
// to the jsonb column — never JSON.stringify a string that's already
// JSON, or it double-encodes into a quoted string value instead of an
// object.
const normalizeMetadata = (metadata) => {
  if (metadata === undefined || metadata === null || metadata === '') {
    return null;
  }
  if (typeof metadata === 'string') {
    try {
      JSON.parse(metadata);
    } catch (e) {
      const err = new Error('metadata must be valid JSON');
      err.status = 400;
      throw err;
    }
    return metadata;
  }
  return JSON.stringify(metadata);
};

// CREATE customer
const createLocalCustomer = async (tenantId, data) => {
  const { email } = data;

  if (!email || !validator.isEmail(email)) {
    const err = new Error('Invalid email address');
    err.status = 400;
    throw err;
  }

  validateLendingFields(data);

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
        vat_registration_number, cr_number, credit_limit, currency, is_taxable,
        status, customer_type, source, notes, tags,
        national_id, date_of_birth, secondary_phone, kyc_status, kyc_verified_at,
        risk_rating, credit_score, is_blacklisted, blacklist_reason,
        guarantor_name, guarantor_phone, guarantor_national_id, guarantor_relationship,
        preferred_payment_method, opening_balance, payment_terms_days, preferred_language,
        assigned_agent_id, customer_since, metadata
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
        $41,$42,$43,$44,$45,$46,$47,$48,$49
      ) RETURNING *`,
      [
        tenantId, data.firstName, data.lastName, data.companyName, data.displayName,
        data.email, data.phone, data.mobile, data.website,
        data.billingStreet, data.billingCity, data.billingState, data.billingPostalCode, data.billingCountry,
        data.shippingStreet, data.shippingCity, data.shippingState, data.shippingPostalCode, data.shippingCountry,
        data.vatRegistrationNumber || null, data.crNumber || null, data.creditLimit || null, data.currency, data.isTaxable,
        data.status, data.customerType, data.source, data.notes, data.tags,
        data.nationalId || null, data.dateOfBirth || null, data.secondaryPhone || null,
        data.kycStatus || 'pending', data.kycVerifiedAt || null,
        data.riskRating || null, data.creditScore || null, data.isBlacklisted, data.blacklistReason || null,
        data.guarantorName || null, data.guarantorPhone || null, data.guarantorNationalId || null, data.guarantorRelationship || null,
        data.preferredPaymentMethod || null, data.openingBalance || 0, data.paymentTermsDays || null, data.preferredLanguage || 'en',
        data.assignedAgentId || null, data.customerSince || null, normalizeMetadata(data.metadata),
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

  validateLendingFields(data);

  // COALESCE keeps existing values for any field the caller omits, rather
  // than nulling them out — this table now carries KYC/guarantor data a
  // partial edit must not silently wipe.
  const result = await db.query(
    `UPDATE customers SET
      first_name                = COALESCE($1, first_name),
      last_name                 = COALESCE($2, last_name),
      company_name              = COALESCE($3, company_name),
      display_name              = COALESCE($4, display_name),
      email                     = COALESCE($5, email),
      phone                     = COALESCE($6, phone),
      mobile                    = COALESCE($7, mobile),
      website                   = COALESCE($8, website),
      billing_street            = COALESCE($9, billing_street),
      billing_city              = COALESCE($10, billing_city),
      billing_state             = COALESCE($11, billing_state),
      billing_postal_code       = COALESCE($12, billing_postal_code),
      billing_country           = COALESCE($13, billing_country),
      shipping_street           = COALESCE($14, shipping_street),
      shipping_city             = COALESCE($15, shipping_city),
      shipping_state            = COALESCE($16, shipping_state),
      shipping_postal_code      = COALESCE($17, shipping_postal_code),
      shipping_country          = COALESCE($18, shipping_country),
      vat_registration_number   = COALESCE($19, vat_registration_number),
      cr_number                 = COALESCE($20, cr_number),
      credit_limit              = COALESCE($21, credit_limit),
      currency                  = COALESCE($22, currency),
      is_taxable                = COALESCE($23, is_taxable),
      status                    = COALESCE($24, status),
      customer_type             = COALESCE($25, customer_type),
      source                    = COALESCE($26, source),
      notes                     = COALESCE($27, notes),
      tags                      = COALESCE($28, tags),
      national_id               = COALESCE($29, national_id),
      date_of_birth             = COALESCE($30, date_of_birth),
      secondary_phone           = COALESCE($31, secondary_phone),
      kyc_status                = COALESCE($32, kyc_status),
      kyc_verified_at           = COALESCE($33, kyc_verified_at),
      risk_rating               = COALESCE($34, risk_rating),
      credit_score              = COALESCE($35, credit_score),
      is_blacklisted            = COALESCE($36, is_blacklisted),
      blacklist_reason          = COALESCE($37, blacklist_reason),
      guarantor_name            = COALESCE($38, guarantor_name),
      guarantor_phone           = COALESCE($39, guarantor_phone),
      guarantor_national_id     = COALESCE($40, guarantor_national_id),
      guarantor_relationship    = COALESCE($41, guarantor_relationship),
      preferred_payment_method  = COALESCE($42, preferred_payment_method),
      opening_balance           = COALESCE($43, opening_balance),
      payment_terms_days        = COALESCE($44, payment_terms_days),
      preferred_language        = COALESCE($45, preferred_language),
      assigned_agent_id         = COALESCE($46, assigned_agent_id),
      customer_since            = COALESCE($47, customer_since),
      metadata                  = COALESCE($48, metadata),
      updated_at                = now()
    WHERE company_id = $49 AND customer_code = $50
    RETURNING *`,
    [
      data.firstName ?? null, data.lastName ?? null, data.companyName ?? null, data.displayName ?? null,
      data.email ?? null, data.phone ?? null, data.mobile ?? null, data.website ?? null,
      data.billingStreet ?? null, data.billingCity ?? null, data.billingState ?? null, data.billingPostalCode ?? null, data.billingCountry ?? null,
      data.shippingStreet ?? null, data.shippingCity ?? null, data.shippingState ?? null, data.shippingPostalCode ?? null, data.shippingCountry ?? null,
      data.vatRegistrationNumber ?? null, data.crNumber ?? null, data.creditLimit ?? null, data.currency ?? null, data.isTaxable ?? null,
      data.status ?? null, data.customerType ?? null, data.source ?? null, data.notes ?? null, data.tags ?? null,
      data.nationalId ?? null, data.dateOfBirth ?? null, data.secondaryPhone ?? null,
      data.kycStatus ?? null, data.kycVerifiedAt ?? null,
      data.riskRating ?? null, data.creditScore ?? null, data.isBlacklisted ?? null, data.blacklistReason ?? null,
      data.guarantorName ?? null, data.guarantorPhone ?? null, data.guarantorNationalId ?? null, data.guarantorRelationship ?? null,
      data.preferredPaymentMethod ?? null, data.openingBalance ?? null, data.paymentTermsDays ?? null, data.preferredLanguage ?? null,
      data.assignedAgentId ?? null, data.customerSince ?? null, normalizeMetadata(data.metadata),
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
