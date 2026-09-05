const express = require('express');
const router = express.Router();
const billsController = require('../../../controllers/bills.controller');

router.get('/', billsController.getBills);
router.post('/', billsController.createBill);
router.get('/:id', billsController.getBillById);
router.put('/:id', billsController.updateBill);
router.patch('/:id/status', billsController.updateBillStatus);

module.exports = router;
