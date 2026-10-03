// Shared Postgres pool and Prisma client.
// The same pool backs Prisma (via the pg driver adapter) and the session store.

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

// pg currently treats sslmode=require as verify-full (full certificate check) and warns that
// this will weaken to libpq semantics in its next major version. Ask for verify-full
// explicitly so the strict check is kept (Neon's certificates pass it).
const connectionString = process.env.DATABASE_URL.replace(/([?&]sslmode=)(require|prefer|verify-ca)\b/, '$1verify-full');

// On Vercel many short-lived function instances each get their own pool, so keep it small
// (Neon's pooled URL multiplexes them). Idle connections are closed before Neon drops them.
const onVercel = Boolean(process.env.VERCEL);
const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX) || (onVercel ? 3 : 10),
  idleTimeoutMillis: onVercel ? 5000 : 30000,
});

// An idle connection closed by the server (e.g. Neon scaling to zero) emits 'error' on the pool.
// Without a handler that would crash the process; the pool simply opens a new connection next time.
pool.on('error', (err) => {
  console.error('Postgres pool: idle connection error:', err.message);
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

module.exports = { pool, prisma };
