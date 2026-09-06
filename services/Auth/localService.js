const bcrypt = require('bcrypt');
const validator = require('validator');
const db = require('../../db');
const companiesService = require('../Companies/localService');

const BCRYPT_COST_FACTOR = 12;
const MIN_PASSWORD_LENGTH = 8;
const ROLES = ['owner', 'finance_manager', 'cashier', 'sales_agent', 'read_only'];

const validatePassword = (password) => {
  if (!validator.isLength(String(password || ''), { min: MIN_PASSWORD_LENGTH })) {
    const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    err.status = 400;
    throw err;
  }
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const publicUser = (row) => ({
  id: row.id,
  companyId: row.company_id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  role: row.role,
  isActive: row.is_active,
});

// Public self-signup: create the company and its first user (role
// 'owner') in one transaction. If either fails -- a bad company name, a
// weak password, anything -- neither persists. There's no duplicate-email
// check needed here: company_id is brand new in this same transaction, so
// no existing row can collide with it under uq_users_company_email.
const registerCompanyAndOwner = async (data) => {
  const email = normalizeEmail(data.email);
  if (!email || !validator.isEmail(email)) {
    const err = new Error('A valid email address is required');
    err.status = 400;
    throw err;
  }
  validatePassword(data.password);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const company = await companiesService.createCompany(
      {
        name: data.companyName,
        country: data.country,
        currency: data.currency,
      },
      client
    );

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR);

    const userResult = await client.query(
      `INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, 'owner')
       RETURNING *`,
      [company.id, email, passwordHash, data.firstName || null, data.lastName || null]
    );

    await client.query('COMMIT');
    return { company, user: publicUser(userResult.rows[0]) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Looks up a user by email alone (the caller doesn't know the company yet)
// across every tenant, since users.email is only unique per company (see
// notes/migration_users_and_auth.sql) -- two different companies may
// independently have a user with the same email. Tries the supplied
// password against every candidate; whichever one it matches is the
// account being logged into. In the vanishingly unlikely case two
// different companies' users share both the same email AND the same
// password, this fails closed rather than guessing which tenant to log
// into.
const login = async (email, password) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    const err = new Error('Email and password are required');
    err.status = 400;
    throw err;
  }

  const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

  const matches = [];
  for (const candidate of result.rows) {
    if (await bcrypt.compare(password, candidate.password_hash)) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }
  if (matches.length > 1) {
    const err = new Error('Multiple accounts match these credentials — contact support');
    err.status = 409;
    throw err;
  }

  const user = matches[0];
  if (!user.is_active) {
    const err = new Error('This account has been deactivated');
    err.status = 403;
    throw err;
  }

  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  return publicUser(user);
};

// ============================================================
// Company-scoped user management -- backs the /settings/users page.
// Every function here takes tenantId first and scopes its query by it,
// same convention as every other service, so an owner can only ever see
// or act on their own company's users.
// ============================================================

const listUsersForCompany = async (tenantId) => {
  const result = await db.query(
    `SELECT id, company_id, email, first_name, last_name, role, is_active, last_login_at, created_at
     FROM users WHERE company_id = $1 ORDER BY created_at ASC`,
    [tenantId]
  );
  return result.rows;
};

// No email service exists in this app (see README) -- there's no invite
// link to send. "Invite" here means the owner creates the account and its
// initial password directly; the new user should change it on first login
// once a self-service password-change flow exists (not built yet).
const inviteUser = async (tenantId, data) => {
  const email = normalizeEmail(data.email);
  if (!email || !validator.isEmail(email)) {
    const err = new Error('A valid email address is required');
    err.status = 400;
    throw err;
  }
  validatePassword(data.password);
  if (!ROLES.includes(data.role)) {
    const err = new Error(`role must be one of: ${ROLES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const duplicate = await client.query(
      'SELECT id FROM users WHERE company_id = $1 AND email = $2',
      [tenantId, email]
    );
    if (duplicate.rows.length > 0) {
      const err = new Error('A user with this email already exists in your company');
      err.status = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR);
    const result = await client.query(
      `INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, email, passwordHash, data.firstName || null, data.lastName || null, data.role]
    );

    await client.query('COMMIT');
    return publicUser(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Shared guard for deactivate/role-change: a company can never be left
// with zero active owners, and a user can never lock themselves out or
// demote themselves by mistake mid-session.
const assertNotLastActiveOwnerOrSelf = async (client, tenantId, targetUserId, actingUserId) => {
  if (Number(targetUserId) === Number(actingUserId)) {
    const err = new Error('You cannot change your own account here');
    err.status = 403;
    throw err;
  }

  const target = await client.query(
    'SELECT role, is_active FROM users WHERE company_id = $1 AND id = $2',
    [tenantId, targetUserId]
  );
  if (target.rows.length === 0) {
    return undefined;
  }

  if (target.rows[0].role === 'owner' && target.rows[0].is_active) {
    const otherOwners = await client.query(
      `SELECT id FROM users WHERE company_id = $1 AND role = 'owner' AND is_active = true AND id <> $2`,
      [tenantId, targetUserId]
    );
    if (otherOwners.rows.length === 0) {
      const err = new Error('Cannot remove the only owner of a company');
      err.status = 409;
      throw err;
    }
  }

  return target.rows[0];
};

const setUserActive = async (tenantId, targetUserId, actingUserId, isActive) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (!isActive) {
      const target = await assertNotLastActiveOwnerOrSelf(client, tenantId, targetUserId, actingUserId);
      if (!target) {
        await client.query('ROLLBACK');
        return undefined;
      }
    }

    const result = await client.query(
      `UPDATE users SET is_active = $1, updated_at = now()
       WHERE company_id = $2 AND id = $3 RETURNING *`,
      [isActive, tenantId, targetUserId]
    );

    await client.query('COMMIT');
    return result.rows[0] ? publicUser(result.rows[0]) : undefined;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const changeUserRole = async (tenantId, targetUserId, actingUserId, newRole) => {
  if (!ROLES.includes(newRole)) {
    const err = new Error(`role must be one of: ${ROLES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (newRole !== 'owner') {
      const target = await assertNotLastActiveOwnerOrSelf(client, tenantId, targetUserId, actingUserId);
      if (!target) {
        await client.query('ROLLBACK');
        return undefined;
      }
    }

    const result = await client.query(
      `UPDATE users SET role = $1, updated_at = now()
       WHERE company_id = $2 AND id = $3 RETURNING *`,
      [newRole, tenantId, targetUserId]
    );

    await client.query('COMMIT');
    return result.rows[0] ? publicUser(result.rows[0]) : undefined;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  ROLES,
  registerCompanyAndOwner,
  login,
  listUsersForCompany,
  inviteUser,
  setUserActive,
  changeUserRole,
};
