const express = require('express');
const router = express.Router();
const customersController = require('../../../controllers/customers.controller');

// API Routes
router.get('/', customersController.getCustomers);              // JSON: all customers
router.get('/search', customersController.searchCustomers);    // JSON: search
router.post('/create', customersController.createCustomer);    // API: create customer

// View Routes
// router.get('/:customer_code/edit', customersController.editCustomer);     // Render edit.ejs
// router.get('/:customer_code/view', customersController.viewCustomer);     // Render detail.ejs
// router.post('/:customer_code/update', customersController.updateCustomer);// Update customer API

module.exports = router;