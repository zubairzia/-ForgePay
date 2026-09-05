const express = require('express');
const router = express.Router();

// Basic page routes for modules that don't have full CRUD web pages yet
// (they're either placeholder pages or only have a JSON API so far).
// Each just renders its index view inside the shared header/sidebar layout,
// matching the pattern used by customers.web.js.

router.get('/paymentsmade', (req, res) => {
  res.render('paymentsmade/index');
});

router.get('/payments', (req, res) => {
  res.render('payments/index');
});

module.exports = router;
