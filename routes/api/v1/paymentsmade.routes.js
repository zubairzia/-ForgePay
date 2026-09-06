const express = require('express');
const router = express.Router();
const paymentsMadeController = require('../../../controllers/paymentsmade.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_BACK_OFFICE), paymentsMadeController.getPaymentsMade);
router.post('/', requireRole(...MANAGE_BACK_OFFICE), paymentsMadeController.createPaymentMade);
router.get('/:id', requireRole(...VIEW_BACK_OFFICE), paymentsMadeController.getPaymentMadeById);

module.exports = router;
