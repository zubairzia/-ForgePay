const express = require('express');
const router = express.Router();

const customerWebRoutes = require('./customers.web');
const vendorWebRoutes = require('./vendors.web');
const itemWebRoutes = require('./items.web');
const invoiceWebRoutes = require('./invoices.web');
const billWebRoutes = require('./bills.web');
const creditNoteWebRoutes = require('./creditnotes.web');
const moduleWebRoutes = require('./modules.web');

router.use('/', customerWebRoutes);
router.use('/', vendorWebRoutes);
router.use('/', itemWebRoutes);
router.use('/', invoiceWebRoutes);
router.use('/', billWebRoutes);
router.use('/', creditNoteWebRoutes);
router.use('/', moduleWebRoutes);

// ADD THIS
router.get('/', (req, res) => {
  res.render('index');
});

module.exports = router;