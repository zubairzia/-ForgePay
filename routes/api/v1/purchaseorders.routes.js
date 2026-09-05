const express = require('express');
const router = express.Router();
const purchaseOrdersController = require('../../../controllers/purchaseorders.controller');

router.get('/', purchaseOrdersController.getPurchaseOrders);
router.post('/', purchaseOrdersController.createPurchaseOrder);
router.get('/:id', purchaseOrdersController.getPurchaseOrderById);
router.put('/:id', purchaseOrdersController.updatePurchaseOrder);
router.patch('/:id/status', purchaseOrdersController.updatePurchaseOrderStatus);

module.exports = router;
