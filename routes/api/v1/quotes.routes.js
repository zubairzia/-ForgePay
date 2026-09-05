const express = require('express');
const router = express.Router();
const quotesController = require('../../../controllers/quotes.controller');

router.get('/', quotesController.getQuotes);
router.post('/', quotesController.createQuote);
router.get('/:id', quotesController.getQuoteById);
router.put('/:id', quotesController.updateQuote);
router.patch('/:id/status', quotesController.updateQuoteStatus);

module.exports = router;
