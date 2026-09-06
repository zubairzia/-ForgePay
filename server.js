require('dotenv').config();

const app = require('./app');
const scheduler = require('./jobs/scheduler');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  scheduler.start();
});
