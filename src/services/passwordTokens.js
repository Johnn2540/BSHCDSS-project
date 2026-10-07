// Single-use tokens for password reset and new-account invitations.
// Only a SHA-256 hash is stored; the raw token only ever appears in the emailed link.

const crypto = require('crypto');
const { prisma } = require('../lib/db');
const { sendMail, assertMailConfigured, logMailError } = require('./mailer');
const { accountEmail } = require('./emailTemplates');
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

function emailOrigin() {
  const configured = (process.env.APP_URL || '').trim();
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('APP_URL is required for account emails.');
  const url = new URL(configured || 'http://localhost:3000');
  if (!['https:', 'http:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('APP_URL must be the website origin, using HTTPS in production.');
  }
  return url.origin;
}

const hoursOrMinutes = (ms) => (ms >= 2 * 3600000 ? `${Math.round(ms / 3600000)} hours` : `${Math.round(ms / 60000)} minutes`);

async function sendAccountEmail(req, user, kind, ttlMs) {
  // Configuration errors must not invalidate an earlier usable link.
  assertMailConfigured();
  const origin = emailOrigin();
  const token = await createToken(user.id, ttlMs);
  try {
    return await sendMail({
      to: user.email,
      ...accountEmail({ kind, name: user.name, email: user.email, url: `${origin}/reset-password/${token}`, expiresIn: hoursOrMinutes(ttlMs), siteName: req.res?.locals?.site?.shortName || 'BSHCDSS' }),
    });
  } catch (error) {
    // A timeout can happen after SMTP accepted the message. Keep that link usable.
    // Only remove this request's token after a confirmed rejection, preserving newer ones.
    if (error.responseCode >= 400 || ['EMAIL_NOT_ACCEPTED', 'EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(error.code)) {
      try {
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, tokenHash: hashToken(token) } });
      } catch (cleanupError) {
        logMailError('rejected email token cleanup', cleanupError);
      }
    }
    throw error;
  }
}

const sendResetEmail = (req, user) => sendAccountEmail(req, user, 'reset', RESET_TOKEN_TTL_MS);
const sendInviteEmail = (req, user) => sendAccountEmail(req, user, 'invite', INVITE_TOKEN_TTL_MS);

module.exports = { hashToken, createToken, findValidToken, sendResetEmail, sendInviteEmail, emailOrigin };
