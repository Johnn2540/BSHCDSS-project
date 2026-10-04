// Startup checks for required configuration. In production, missing security-critical
// settings stop the server rather than letting it run in an unsafe state.

function checkEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    errors.push('DATABASE_URL is not set. Add your Neon connection string to .env.');
  } else if (/[<>]/.test(dbUrl)) {
    errors.push('DATABASE_URL in .env is still the placeholder. Replace it with your Neon pooled connection string (Neon dashboard -> Connect).');
  } else {
    let parsed = null;
    try {
      parsed = new URL(dbUrl);
    } catch {
      // handled below
    }
    if (!parsed || !['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
      errors.push('DATABASE_URL in .env is not a valid connection string. It should start with postgresql:// (copy it from Neon dashboard -> Connect).');
    }
  }
  if (!process.env.SESSION_SECRET) errors.push('SESSION_SECRET is not set.');

  if (isProd) {
    // Without APP_URL, emailed links would be built from the request's Host header,
    // which an attacker can forge to steal password reset tokens.
    if (!/^https:\/\/[^/]+/.test(process.env.APP_URL || '')) {
      errors.push('APP_URL must be set to the site address starting with https:// (e.g. https://bshcdss.onrender.com).');
    }
    if ((process.env.SESSION_SECRET || '').length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters in production.');
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      warnings.push('Cloudinary is not configured: image, video and document uploads will fail.');
    }
    if (!process.env.SMTP_HOST || !process.env.MAIL_FROM) {
      warnings.push('SMTP_HOST / MAIL_FROM not set: password reset, invitations and the contact form cannot send email.');
    }
  }

  warnings.forEach((w) => console.warn(`[config] Warning: ${w}`));
  if (errors.length) {
    errors.forEach((e) => console.error(`[config] ${e}`));
    throw new Error('Invalid configuration. See the messages above.');
  }
}

module.exports = checkEnv;
