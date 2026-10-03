module.exports = {
  BCRYPT_ROUNDS: 12,
  MIN_PASSWORD_LENGTH: 10,
  SESSION_MAX_AGE_MS: 8 * 60 * 60 * 1000, // 8 hours
  RESET_TOKEN_TTL_MS: 60 * 60 * 1000, // 1 hour
  INVITE_TOKEN_TTL_MS: 72 * 60 * 60 * 1000, // 3 days, for new tutor accounts
  // Where each role lands after logging in.
  HOME_BY_ROLE: { ADMIN: '/admin', TUTOR: '/tutor' },
};
