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
const companiesWebRoutes = require('./companies.web');
const settingsWebRoutes = require('./settings.web');
const jobsWebRoutes = require('./jobs.web');

const { requireRole } = require('../../middleware/auth.middleware');
const { ALL_ROLES } = require('../../middleware/roleGroups');

router.use('/', customerWebRoutes);
router.use('/', creditAccountWebRoutes);
router.use('/', repaymentWebRoutes);
router.use('/', vendorWebRoutes);
router.use('/', itemWebRoutes);
router.use('/', invoiceWebRoutes);
router.use('/', billWebRoutes);
router.use('/', creditNoteWebRoutes);
router.use('/', moduleWebRoutes);
router.use('/', companiesWebRoutes);
router.use('/', settingsWebRoutes);
router.use('/', jobsWebRoutes);

// Read-only aggregate every role has some view access to (see
// middleware/roleGroups.js).
router.get('/', requireRole(...ALL_ROLES), (req, res) => {
  res.render('dashboard/index');
});

module.exports = router;
