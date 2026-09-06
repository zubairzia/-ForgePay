const db = require('../db');
const { runDailyStatusUpdate } = require('../services/Jobs/dailyStatusUpdate');

// job_runs is deliberately global (not tenant-scoped) -- a run processes
// every company in one go, so there's no company_id to filter by. Any
// owner can see the full history of when the job ran and whether it
// succeeded; see the note in views/settings/jobs.ejs for why that's an
// acceptable tradeoff for now.
const jobsPage = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 20`
    );
    res.render('settings/jobs', { runs: result.rows, error: null });
  } catch (error) {
    next(error);
  }
};

const triggerRun = async (req, res, next) => {
  try {
    await runDailyStatusUpdate();
    res.redirect('/settings/jobs');
  } catch (error) {
    next(error);
  }
};

module.exports = { jobsPage, triggerRun };
