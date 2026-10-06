// Shared email configuration. Never log the returned SMTP options: they contain credentials.
function mailbox(value) {
  if (value && typeof value === 'object') value = value.address;
  if (typeof value !== 'string' || /[\r\n]/.test(value)) return null;
  const match = value.trim().match(/^(?:[^<>]+<([^<>]+)>|([^<>]+))$/);
  const address = (match?.[1] || match?.[2] || '').trim();
  return address.length <= 254 && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(address) ? address : null;
}

function getEmailConfig(env = process.env) {
  const host = (env.SMTP_HOST || '').trim().toLowerCase();
  const user = (env.SMTP_USER || '').trim();
  const gmail = host === 'smtp.gmail.com';
  // Google's displayed app-password spaces are formatting, not part of the password.
  const pass = gmail ? (env.SMTP_PASS || '').replace(/\s/g, '') : (env.SMTP_PASS || '');
  const from = (env.MAIL_FROM || '').trim();
  const contactEmail = (env.CONTACT_EMAIL || '').trim();
  const portValue = (env.SMTP_PORT || '587').trim();
  const port = Number(portValue);
  const secureValue = (env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureValue ? secureValue === 'true' : port === 465;
  const errors = [];
  const warnings = [];
  if (host) {
    if (/\s|:\/\//.test(host)) errors.push('SMTP_HOST must be a hostname, without a URL scheme or spaces.');
    if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) errors.push('SMTP_PORT must be a valid port number.');
    if (secureValue && !['true', 'false'].includes(secureValue)) errors.push('SMTP_SECURE must be true or false.');
    if ((port === 465 && !secure) || (port === 587 && secure)) errors.push('Use SMTP_SECURE=true with port 465, or false with port 587.');
    if (!mailbox(from)) errors.push('MAIL_FROM must contain one valid sender email address.');
    if (Boolean(user) !== Boolean(pass) || (gmail && (!user || !pass))) errors.push('SMTP_USER and SMTP_PASS must both be configured for authenticated SMTP.');
    if (gmail && mailbox(from)?.toLowerCase() !== user.toLowerCase()) {
      warnings.push('The Gmail sender differs from SMTP_USER. Verify its Send mail as alias, or Gmail may replace the sender address.');
    }
  } else if (user || pass) {
    errors.push('SMTP_HOST is required when SMTP credentials are configured.');
  }
  if (contactEmail && !mailbox(contactEmail)) errors.push('CONTACT_EMAIL must contain one valid email address.');
  return {
    enabled: Boolean(host), from, contactEmail, errors, warnings,
    smtp: {
      host, port, secure, requireTLS: !secure,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, dnsTimeout: 10000,
      ...(user ? { auth: { user, pass } } : {}),
    },
  };
}

module.exports = { getEmailConfig, mailbox };
