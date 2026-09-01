const express = require('express');
const router = express.Router();

// Basic page routes for modules that don't have full CRUD web pages yet
// (they're either placeholder pages or only have a JSON API so far).
// Each just renders its index view inside the shared header/sidebar layout,
// matching the pattern used by customers.web.js.

router.get('/vendors', (req, res) => {
  res.render('vendors/index');
});

router.get('/bills', (req, res) => {
  res.render('bills/index');
});

router.get('/invoices', (req, res) => {
  res.render('invoices/index');
});

router.get('/quotes', (req, res) => {
  res.render('quotes/index');
});

router.get('/purchaseorders', (req, res) => {
  res.render('purchaseorders/index');
});

router.get('/expenses', (req, res) => {
  res.render('expenses/index');
});

router.get('/items', (req, res) => {
  res.render('items/index');
});

router.get('/paymentsmade', (req, res) => {
  res.render('paymentsmade/index');
});

router.get('/salesorders', (req, res) => {
  res.render('salesorders/index');
});

router.get('/payments', (req, res) => {
  res.render('payments/index');
});

router.get('/creditnotes', (req, res) => {
  res.render('creditnotes/index');
});

module.exports = router;
