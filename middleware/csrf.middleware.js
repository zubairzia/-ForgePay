const crypto = require('crypto');

/**
 * Synchronizer-token CSRF protection for the server-rendered EJS forms.
 * Session-cookie auth makes those forms CSRF-vulnerable in a way they
 * weren't before -- a plain hardcoded-tenant prototype had nothing worth
 * forging a request against. Scoped to web routes only: /api/v1 JSON
 * endpoints are not simple form submissions a malicious page could
 * replicate (no cross-origin CORS is configured, so a fetch from another
 * origin never reaches this server with credentials attached), and the
 * session cookie is set SameSite=Lax as a second layer (see app.js).
 */

// Ensures every session has a token, and exposes it to every EJS render
// via res.locals so templates can do:
//   <input type="hidden" name="_csrf" value="<%= csrfToken %>">
// Mounted globally on the web router, ahead of both the login/register
// pages and the requireAuth-protected ones -- the token has to exist
// before a form is ever rendered, including the login form itself.
const ensureCsrfToken = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
};

// Validates state-changing requests. GET/HEAD/OPTIONS are read-only by
// definition and carry no risk, so they pass through untouched.
const verifyCsrfToken = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const submitted = req.body && req.body._csrf;
  if (!submitted || submitted !== req.session.csrfToken) {
    const err = new Error('Your session has expired or this form was submitted incorrectly. Please go back and try again.');
    err.status = 403;
    return next(err);
  }
  next();
};

module.exports = { ensureCsrfToken, verifyCsrfToken };
