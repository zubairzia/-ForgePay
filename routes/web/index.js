const express = require('express');
const router = express.Router();

const customerWebRoutes = require('./customers.web');
const moduleWebRoutes = require('./modules.web');
const settingsWebRoutes = require('./settings.web');

router.use('/', customerWebRoutes);
router.use('/', moduleWebRoutes);
router.use('/', settingsWebRoutes);

// ADD THIS
router.get('/', (req, res) => {
  res.render('index');
});

module.exports = router;