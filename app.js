const express = require('express');
const path = require('path');

require('./db'); // Force DB connection

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

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Routes
const routes = require('./routes');
app.use(routes);

module.exports = app;