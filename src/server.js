require('dotenv').config({ quiet: true });
try {
  require('./config/checkEnv')();
} catch {
  // checkEnv has already printed what is wrong; exit without a stack trace.
  console.error('[config] Fix the settings in .env, then start the server again.');
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`BSHCDSS site running at http://localhost:${PORT}`);
});
