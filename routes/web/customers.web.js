const express = require('express');
const router = express.Router();

const customersController = require('../../controllers/customers.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_CUSTOMERS_ACCOUNTS, MANAGE_CUSTOMERS_ACCOUNTS } = require('../../middleware/roleGroups');

// Customer Pages
router.get('/customers', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), (req, res) => {
  res.render('customers/index');
});

router.get('/customers/create', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), (req, res) => {
  res.render('customers/create');
});

router.post('/customers/create', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), customersController.createCustomer);

router.get('/customers/:customer_code/view', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), customersController.viewCustomer);

router.get('/customers/:customer_code/edit', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), customersController.editCustomer);

router.post('/customers/:customer_code/update', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), customersController.updateCustomer);

module.exports = router;
