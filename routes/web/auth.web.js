const express = require('express');
const router = express.Router();
const authController = require('../../controllers/auth.controller');
const { verifyCsrfToken } = require('../../middleware/csrf.middleware');

// Mounted ahead of requireAuth in routes/index.js -- these three are the
// only web pages reachable while logged out.
router.get('/register', authController.registerPage);
router.post('/register', verifyCsrfToken, authController.submitRegister);

router.get('/login', authController.loginPage);
router.post('/login', verifyCsrfToken, authController.submitLogin);

router.post('/logout', verifyCsrfToken, authController.logout);

module.exports = router;
