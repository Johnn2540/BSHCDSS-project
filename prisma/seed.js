// Seeds the database. Run with: npm run db:seed
//   1. Creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in .env.
//   2. Inserts the starter partners and activities (src/data/defaults.js) if those tables are empty.
// Safe to re-run: existing records are never changed.

require('dotenv').config({ quiet: true });

const bcrypt = require('bcrypt');
const { prisma, pool } = require('../src/lib/db');
const { BCRYPT_ROUNDS, MIN_PASSWORD_LENGTH } = require('../src/config/auth');
const defaults = require('../src/data/defaults');

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || 'Site Administrator').trim();

  if (!email || /[<>]/.test(email)) {
    throw new Error('Set ADMIN_EMAIL in .env (replace the <placeholder>) before seeding.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL in .env is not a valid email address.');
  }

  // Checked before the password so the seed can be re-run after ADMIN_PASSWORD is removed.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin: an account for ${email} already exists (role ${existing.role}). Nothing changed.`);
    return;
  }

  if (!password || /[<>]/.test(password)) {
    throw new Error('Set ADMIN_PASSWORD in .env (replace the <placeholder>) before seeding.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  await prisma.user.create({
    data: { email, name, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), role: 'ADMIN', status: 'ACTIVE' },
  });
  console.log(`Admin: account created for ${email}. You can now remove ADMIN_PASSWORD from .env.`);
}

async function seedIfEmpty(label, model, rows) {
  if ((await model.count()) > 0) {
    console.log(`${label}: already has records. Nothing changed.`);
    return;
  }
  await model.createMany({ data: rows });
  console.log(`${label}: added ${rows.length} starter record(s).`);
}

async function main() {
  // Starter content doesn't depend on the admin settings, so a missing admin doesn't block it.
  await seedIfEmpty('Partners', prisma.partner, defaults.partners);
  await seedIfEmpty('Activities', prisma.activity, defaults.activities);
  try {
    await seedAdmin();
  } catch (err) {
    console.error(`Admin: not created. ${err.message}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
