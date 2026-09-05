const express = require('express');
const router = express.Router();

const customerWebRoutes = require('./customers.web');
const creditAccountWebRoutes = require('./creditaccounts.web');
const repaymentWebRoutes = require('./repayments.web');
const vendorWebRoutes = require('./vendors.web');
const itemWebRoutes = require('./items.web');
const invoiceWebRoutes = require('./invoices.web');
const billWebRoutes = require('./bills.web');
const creditNoteWebRoutes = require('./creditnotes.web');
const moduleWebRoutes = require('./modules.web');

router.use('/', customerWebRoutes);
router.use('/', creditAccountWebRoutes);
router.use('/', repaymentWebRoutes);
router.use('/', vendorWebRoutes);
router.use('/', itemWebRoutes);
router.use('/', invoiceWebRoutes);
router.use('/', billWebRoutes);
router.use('/', creditNoteWebRoutes);
router.use('/', moduleWebRoutes);

router.get('/', (req, res) => {
  res.render('dashboard/index');
});

module.exports = router;