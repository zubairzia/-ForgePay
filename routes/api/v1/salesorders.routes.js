const express = require('express');
const router = express.Router();
const salesOrdersController = require('../../../controllers/salesorders.controller');

router.get('/', salesOrdersController.getSalesOrders);
router.post('/', salesOrdersController.createSalesOrder);
router.get('/:id', salesOrdersController.getSalesOrderById);
router.put('/:id', salesOrdersController.updateSalesOrder);
router.patch('/:id/status', salesOrdersController.updateSalesOrderStatus);

module.exports = router;
