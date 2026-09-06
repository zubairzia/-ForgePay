const express = require('express');
const router = express.Router();
const billsController = require('../../../controllers/bills.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_BACK_OFFICE), billsController.getBills);
router.post('/', requireRole(...MANAGE_BACK_OFFICE), billsController.createBill);
router.get('/:id', requireRole(...VIEW_BACK_OFFICE), billsController.getBillById);
router.put('/:id', requireRole(...MANAGE_BACK_OFFICE), billsController.updateBill);
router.patch('/:id/status', requireRole(...MANAGE_BACK_OFFICE), billsController.updateBillStatus);

module.exports = router;
