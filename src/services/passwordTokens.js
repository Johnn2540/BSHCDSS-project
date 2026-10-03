// Single-use tokens for password reset and new-account invitations.
// Only a SHA-256 hash is stored; the raw token only ever appears in the emailed link.

const crypto = require('crypto');
const { prisma } = require('../lib/db');
const { sendMail } = require('./mailer');
const { RESET_TOKEN_TTL_MS, INVITE_TOKEN_TTL_MS } = require('../config/auth');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Replaces any earlier tokens for the user and returns the raw token.
async function createToken(userId, ttlMs) {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
    }),
  ]);
  return token;
}

async function findValidToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, status: true } } },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.status !== 'ACTIVE') return null;
  return record;
}

function linkFor(req, token) {
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${appUrl}/reset-password/${token}`;
}

const hoursOrMinutes = (ms) => (ms >= 2 * 3600000 ? `${Math.round(ms / 3600000)} hours` : `${Math.round(ms / 60000)} minutes`);

async function sendResetEmail(req, user) {
  const token = await createToken(user.id, RESET_TOKEN_TTL_MS);
  await sendMail({
    to: user.email,
    subject: 'Reset your BSHCDSS password',
    text:
      `Hello ${user.name},\n\n` +
      `We received a request to reset the password for your BSHCDSS account.\n\n` +
      `Reset your password here (link valid for ${hoursOrMinutes(RESET_TOKEN_TTL_MS)}):\n${linkFor(req, token)}\n\n` +
      `If you did not request this, you can ignore this email; your password will not change.\n`,
  });
}

async function sendInviteEmail(req, user) {
  const token = await createToken(user.id, INVITE_TOKEN_TTL_MS);
  await sendMail({
    to: user.email,
    subject: 'Your BSHCDSS tutor account',
    text:
      `Hello ${user.name},\n\n` +
      `An account has been created for you on the BSHCDSS website.\n\n` +
      `Choose your password here (link valid for ${hoursOrMinutes(INVITE_TOKEN_TTL_MS)}):\n${linkFor(req, token)}\n\n` +
      `Then log in with this email address (${user.email}).\n`,
  });
}

module.exports = { hashToken, createToken, findValidToken, sendResetEmail, sendInviteEmail };
