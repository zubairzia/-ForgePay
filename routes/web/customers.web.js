const express = require('express');
const router = express.Router();

const customersController = require('../../controllers/customers.controller');

// Customer Pages
router.get('/customers', (req, res) => {
  res.render('customers/index');
});

router.get('/customers/create', (req, res) => {
  res.render('customers/create');
});

// Create form posts here (web layer), not to /api/v1/customers/create —
// that endpoint sits behind tenantMiddleware, which requires an
// X-Tenant-Id header a plain HTML <form> can't send. This route already
// has tenantId via webTenantMiddleware, same as the working edit/update
// route below.
router.post('/customers/create', customersController.createCustomer);

router.get('/customers/:customer_code/view', customersController.viewCustomer);

router.get('/customers/:customer_code/edit', customersController.editCustomer);

router.post('/customers/:customer_code/update', customersController.updateCustomer);

module.exports = router;