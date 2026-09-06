const cron = require('node-cron');
const { runDailyStatusUpdate, JOB_NAME } = require('../services/Jobs/dailyStatusUpdate');

// 2:00 AM server time, daily -- early morning, before business hours.
// node-cron runs in-process: no new infrastructure (no Redis) for a
// single daily batch job. If this ever runs on more than one server
// process, every process's cron would fire this at the same moment --
// runDailyStatusUpdate's idempotency (see
// services/Jobs/dailyStatusUpdate.js) makes that redundant work rather
// than dangerous, but the real fix at that point is either designating
// one process to run cron, or moving to a Postgres-backed job queue like
// pg-boss, which needs no new infrastructure either.
const CRON_SCHEDULE = '0 2 * * *';

const start = () => {
  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      const result = await runDailyStatusUpdate();
      console.log(`[${JOB_NAME}] run ${result.jobRunId}: ${result.status}, ${result.recordsProcessed} records processed`);
      if (result.errors.length > 0) {
        console.error(`[${JOB_NAME}] errors:`, result.errors);
      }
    } catch (err) {
      console.error(`[${JOB_NAME}] failed to run:`, err);
    }
  });
  console.log(`[${JOB_NAME}] scheduled: ${CRON_SCHEDULE}`);
};

module.exports = { start };
