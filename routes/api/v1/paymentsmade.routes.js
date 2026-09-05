const express = require('express');
const router = express.Router();
const paymentsMadeController = require('../../../controllers/paymentsmade.controller');

router.get('/', paymentsMadeController.getPaymentsMade);
router.post('/', paymentsMadeController.createPaymentMade);
router.get('/:id', paymentsMadeController.getPaymentMadeById);

module.exports = router;
