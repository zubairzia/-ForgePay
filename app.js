const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const pool = require('./db'); // Force DB connection; also the pg Pool connect-pg-simple stores sessions in.

const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Shared reference data available to every template (country/currency/
// customer-type dropdowns) — set once here rather than passed by every
// route handler, since Vendors and Companies forms will need them too.
app.locals.countries = require('./constants/countries');
app.locals.currencies = require('./constants/currencies');
app.locals.customerTypes = require('./constants/customerTypes');

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Sessions, persisted in Postgres (the `session` table from
// notes/migration_users_and_auth.sql -- connect-pg-simple's own schema,
// not one we invented) rather than in memory, so a login survives a
// server restart and works across multiple server processes.
// req.tenantId is derived from req.session.user.companyId by
// middleware/auth.middleware.js's requireAuth -- never from a
// client-supplied header or a hardcoded constant.
app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  // false, not true: ensureCsrfToken (middleware/csrf.middleware.js)
  // explicitly writes req.session.csrfToken on first touch, which forces
  // a save on its own. Leaving this false avoids persisting an empty
  // session row for every request that never touches the session at all.
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // TODO: flip to true once this is deployed behind HTTPS -- local dev
    // runs plain HTTP, and `secure: true` would silently stop the cookie
    // from ever being set.
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Routes
const routes = require('./routes');
app.use(routes);

// Error handler -- must be mounted last (after every route), and takes 4
// args so Express recognizes it as an error handler rather than regular
// middleware. Every controller in this app calls next(error) expecting a
// JSON response; without this mounted, Express falls back to its own
// default HTML error page instead.
app.use(require('./middleware/error.middleware'));

module.exports = app;