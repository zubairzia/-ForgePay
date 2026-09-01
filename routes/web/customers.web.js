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

router.get('/customers/:customer_code/view', customersController.viewCustomer);

router.get('/customers/:customer_code/edit', customersController.editCustomer);

router.post('/customers/:customer_code/update', customersController.updateCustomer);

module.exports = router;