const express = require('express');
const router = express.Router();
const customersController = require('../../../controllers/customers.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_CUSTOMERS_ACCOUNTS, MANAGE_CUSTOMERS_ACCOUNTS } = require('../../../middleware/roleGroups');

// API Routes
router.get('/', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), customersController.getCustomers);
router.get('/search', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), customersController.searchCustomers);
router.post('/create', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), customersController.createCustomer);

// View Routes
// router.get('/:customer_code/edit', customersController.editCustomer);     // Render edit.ejs
// router.get('/:customer_code/view', customersController.viewCustomer);     // Render detail.ejs
// router.post('/:customer_code/update', customersController.updateCustomer);// Update customer API

module.exports = router;
