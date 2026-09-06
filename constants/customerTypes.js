// Canonical customer_type values. Lowercase, not the 'Business'/'Individual'
// casing older rows used — see notes/migration_customer_mandatory_fields.sql
// for the one-time normalization of existing data.
const CUSTOMER_TYPES = ['individual', 'business'];

module.exports = CUSTOMER_TYPES;
