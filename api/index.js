// Vercel entry point. Vercel runs the Express app as a serverless function;
// every request that isn't a static file in public/ is rewritten here (see vercel.json).
// Locally, use `npm run dev` / `npm start` (src/server.js) instead.

require('dotenv').config({ quiet: true });
require('../src/config/checkEnv')();

module.exports = require('../src/app');
