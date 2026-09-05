const express = require('express');
const router = express.Router();

const customerWebRoutes = require('./customers.web');
const moduleWebRoutes = require('./modules.web');

router.use('/', customerWebRoutes);
router.use('/', moduleWebRoutes);

// ADD THIS
router.get('/', (req, res) => {
  res.render('index');
});

module.exports = router;