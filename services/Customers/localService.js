const db = require('../../db');
const validator = require('validator');
const COUNTRIES = require('../../constants/countries');
const CURRENCIES = require('../../constants/currencies');
const CUSTOMER_TYPES = require('../../constants/customerTypes');

// Normalizes + validates an ISO 3166-1 alpha-2 country code against the
// shared list (the dropdown only ever sends one of these, but the API can
// be hit directly, so this is the actual enforcement). Blank/undefined
// passes through untouched — mandatory-field checks handle those.
const normalizeCountryCode = (code, label) => {
  if (code === undefined || code === null || code === '') return code;
  const upper = String(code).trim().toUpperCase();
  if (!COUNTRIES.some((c) => c.code === upper)) {
    const err = new Error(`${label} must be a valid ISO 3166-1 country code`);
    err.status = 400;
    throw err;
  }
  return upper;
};

const normalizeCurrencyCode = (code) => {
  if (code === undefined || code === null || code === '') return code;
  const upper = String(code).trim().toUpperCase();
  if (!CURRENCIES.some((c) => c.code === upper)) {
    const err = new Error('currency must be a valid ISO 4217 currency code');
    err.status = 400;
    throw err;
  }
  return upper;
};

const normalizeCustomerType = (type) => {
  if (type === undefined || type === null || type === '') return type;
  const lower = String(type).trim().toLowerCase();
  if (!CUSTOMER_TYPES.includes(lower)) {
    const err = new Error(`customerType must be one of: ${CUSTOMER_TYPES.join(', ')}`);
    err.status = 400;
    throw err;
  }
  return lower;
};

// Identity fields that must be unique per tenant. Mirrors
// notes/migration_customer_identity_uniqueness.sql's partial unique
// indexes (uq_customers_company_email/_cr_number/_vat_number/_national_id)
// — each maps a Postgres constraint/index name to the column it backs and
// a human label, so a raw 23505 unique_violation can be translated into
// the same clean, field-specific message the app-level pre-check throws.
const IDENTITY_UNIQUE_FIELDS = [
  { column: 'email', dataKey: 'email', label: 'email address', indexName: 'uq_customers_company_email' },
  { column: 'cr_number', dataKey: 'crNumber', label: 'CR number', indexName: 'uq_customers_company_cr_number' },
  { column: 'vat_registration_number', dataKey: 'vatRegistrationNumber', label: 'VAT registration number', indexName: 'uq_customers_company_vat_number' },
  { column: 'national_id', dataKey: 'nationalId', label: 'national ID', indexName: 'uq_customers_company_national_id' },
];

// App-level pre-check for all four unique-per-tenant identity fields, run
// inside the caller's transaction so the check and the write stay atomic.
// Skips any field that's blank (customers.*_not_null / the partial unique
// indexes both already treat blank/null as "no value, no collision").
// excludeCustomerId lets updateLocalCustomer check without tripping over
// the row being edited.
const checkDuplicateIdentityFields = async (client, tenantId, values, excludeCustomerId) => {
  for (const { column, dataKey, label } of IDENTITY_UNIQUE_FIELDS) {
    const value = values[dataKey];
    if (value === undefined || value === null || value === '') continue;

    const params = [tenantId, value];
    let query = `SELECT id FROM customers WHERE company_id = $1 AND ${column} = $2`;
    if (excludeCustomerId !== undefined) {
      params.push(excludeCustomerId);
      query += ' AND id <> $3';
    }

    const duplicate = await client.query(query, params);
    if (duplicate.rows.length > 0) {
      const err = new Error(`A customer with this ${label} already exists`);
      err.status = 409;
      throw err;
    }
  }
};

// Backstop for the race window between the pre-check above and the actual
// INSERT/UPDATE (two concurrent requests both passing the check before
// either commits) — translates a raw Postgres unique_violation into the
// same clean, field-specific message rather than letting the constraint
// error reach the user.
const translateUniqueViolation = (err) => {
  if (err.code === '23505' && err.constraint) {
    const field = IDENTITY_UNIQUE_FIELDS.find((f) => f.indexName === err.constraint);
    if (field) {
      const friendly = new Error(`A customer with this ${field.label} already exists`);
      friendly.status = 409;
      return friendly;
    }
  }
  return err;
};

// Validates the fully-resolved (post-merge, for updates) field set: the
// four unconditionally-mandatory fields, plus vat_registration_number/
// cr_number which are only mandatory when the resolved customer_type is
// 'business' — individuals borrowing on installments have a national ID,
// not a commercial registration or VAT number.
const validateMandatoryFields = (resolved) => {
  const requireNonBlank = (value, label) => {
    if (!String(value ?? '').trim()) {
      const err = new Error(`${label} is required`);
      err.status = 400;
      throw err;
    }
  };

  requireNonBlank(resolved.lastName, 'lastName');
  requireNonBlank(resolved.email, 'email');
  requireNonBlank(resolved.billingCountry, 'billingCountry');
  requireNonBlank(resolved.currency, 'currency');

  if (resolved.customerType === 'business') {
    requireNonBlank(resolved.vatRegistrationNumber, 'vatRegistrationNumber (required for business customers)');
    requireNonBlank(resolved.crNumber, 'crNumber (required for business customers)');
  }
};

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

  data.billingCountry = normalizeCountryCode(data.billingCountry, 'billingCountry');
  data.shippingCountry = normalizeCountryCode(data.shippingCountry, 'shippingCountry');
  data.currency = normalizeCurrencyCode(data.currency);
  data.customerType = normalizeCustomerType(data.customerType);
  validateMandatoryFields(data);

  // Wrap in a transaction: the duplicate check + insert should be atomic.
  // The partial unique indexes (see
  // notes/migration_customer_identity_uniqueness.sql) are the backstop for
  // the remaining race window between two concurrent requests — caught
  // below via translateUniqueViolation.
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await checkDuplicateIdentityFields(client, tenantId, data);

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
    throw translateUniqueViolation(err);
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

  data.billingCountry = normalizeCountryCode(data.billingCountry, 'billingCountry');
  data.shippingCountry = normalizeCountryCode(data.shippingCountry, 'shippingCountry');
  data.currency = normalizeCurrencyCode(data.currency);
  data.customerType = normalizeCustomerType(data.customerType);

  // Wrapped in a transaction like createLocalCustomer: the existing-row
  // fetch, duplicate pre-check, and UPDATE must all see a consistent
  // snapshot, and FOR UPDATE closes the race window where a concurrent
  // edit changes `current` out from under the merge below.
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM customers WHERE company_id = $1 AND customer_code = $2 FOR UPDATE',
      [tenantId, id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return undefined;
    }
    const current = existing.rows[0];

    // Validate against the row as it will exist AFTER the update — the
    // UPDATE below uses COALESCE(new, existing) per field, so mandatory
    // checks must run against that same merge, not against `data` alone,
    // or a partial edit could blank a mandatory field undetected.
    validateMandatoryFields({
      lastName: data.lastName !== undefined ? data.lastName : current.last_name,
      email: data.email !== undefined ? data.email : current.email,
      billingCountry: data.billingCountry !== undefined ? data.billingCountry : current.billing_country,
      currency: data.currency !== undefined ? data.currency : current.currency,
      customerType: data.customerType !== undefined ? data.customerType : (current.customer_type || '').toLowerCase(),
      vatRegistrationNumber: data.vatRegistrationNumber !== undefined ? data.vatRegistrationNumber : current.vat_registration_number,
      crNumber: data.crNumber !== undefined ? data.crNumber : current.cr_number,
    });

    // Same identity-uniqueness rules as create, excluding this row itself
    // — without this, editing a customer's email/CR/VAT/national ID to
    // match another existing customer would only be caught by the raw DB
    // constraint (an unhandled 23505), not a clean error.
    await checkDuplicateIdentityFields(client, tenantId, data, current.id);

    // COALESCE keeps existing values for any field the caller omits, rather
    // than nulling them out — this table now carries KYC/guarantor data a
    // partial edit must not silently wipe.
    const result = await client.query(
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
  getAllLocalCustomers,
  createLocalCustomer,
  searchLocalCustomers,
  getCustomerById,
  updateLocalCustomer,
};
