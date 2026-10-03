// Prisma CLI configuration (migrations, seed, connection URL).
// Prisma 7 does not load .env automatically, so dotenv is loaded here.
require('dotenv').config({ quiet: true });

const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    // Migrations need Neon's direct (unpooled) connection; the app uses the pooled DATABASE_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    // Optional; only needed if `prisma migrate dev` can't create its own shadow database.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
