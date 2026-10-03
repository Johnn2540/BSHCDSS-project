// Runs database migrations during a Vercel build, but only for production deployments.
// Preview deployments (every pushed branch) must never change the production database.

const { execSync } = require('child_process');

if (process.env.VERCEL_ENV !== 'production') {
  console.log(`[migrate] Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV || 'not set'}).`);
  process.exit(0);
}

console.log('[migrate] Production build: applying database migrations...');
execSync('npx prisma migrate deploy', { stdio: 'inherit' });
