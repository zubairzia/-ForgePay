const express = require('express');
const router = express.Router();
const jobsController = require('../../controllers/jobs.controller');
const { requireRole } = require('../../middleware/auth.middleware');
const { verifyCsrfToken } = require('../../middleware/csrf.middleware');

// Owner-only, same as /settings/users -- job_runs is global operational
// data, not something to expose beyond the role that already manages
// company-wide settings.
router.get('/settings/jobs', requireRole('owner'), jobsController.jobsPage);
router.post('/settings/jobs/run', requireRole('owner'), verifyCsrfToken, jobsController.triggerRun);

module.exports = router;
