const { Pool, types } = require('pg');

// pg's default DATE (OID 1082) parser builds a JS Date object at local
// midnight, then every downstream .toISOString()/JSON.stringify() call
// converts that back to UTC — shifting the calendar date by up to a day
// depending on the server's timezone (e.g. a stored '2026-10-31' comes
// back as '2026-10-31T19:00:00.000Z', a different calendar day in some
// timezones). Returning the raw 'YYYY-MM-DD' string instead sidesteps any
// timezone math for a value that was never a timestamp to begin with.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || undefined,
  port: process.env.DB_PORT,
});

pool.connect()
  .then(() => console.log("✅ PostgreSQL Connected"))
  .catch(err => console.error("❌ DB Connection Error:", err));

module.exports = pool;