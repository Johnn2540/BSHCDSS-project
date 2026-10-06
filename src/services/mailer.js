const nodemailer = require('nodemailer');
const { getEmailConfig, mailbox } = require('../config/email');

function mailError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, errorDetails(details));
  return error;
}

// SMTP errors can carry message content or authentication details. Log only these fields.
function errorDetails(error = {}) {
  return {
    code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'EMAIL_DELIVERY',
    ...(Number.isInteger(error.responseCode) ? { responseCode: error.responseCode } : {}),
    ...(/^(CONN|EHLO|HELO|STARTTLS|AUTH(?: (?:PLAIN|LOGIN|XOAUTH2))?|MAIL FROM|RCPT TO|DATA)$/.test(error.command || '') ? { command: error.command } : {}),
  };
}

function logMailError(context, error) {
  console.error(`[email] ${context}`, errorDetails(error));
}

function createMailer({ env = process.env, createTransport = nodemailer.createTransport } = {}) {
  const config = getEmailConfig(env);
  let transporter;

  function assertConfigured() {
    if (!config.enabled || config.errors.length) {
      throw mailError(config.errors.join(' ') || 'SMTP is not configured.', { code: 'EMAIL_CONFIG' });
    }
  }

  function transport() {
    assertConfigured();
    return transporter ||= createTransport(config.smtp);
  }

  async function sendMail({ to, replyTo, subject, text, html }) {
    assertConfigured();
    const recipient = mailbox(to);
    if (!recipient || (replyTo && !mailbox(replyTo))) throw mailError('A valid recipient and reply address are required.', { code: 'EMESSAGE' });
    if (typeof subject !== 'string' || /[\r\n]/.test(subject)) throw mailError('A single-line email subject is required.', { code: 'EMESSAGE' });
    try {
      const info = await transport().sendMail({ from: config.from, to, replyTo, subject, text, html });
      if (!info.accepted?.some((address) => String(address).toLowerCase() === recipient.toLowerCase())) {
        throw mailError('The SMTP server did not accept the recipient.', { code: 'EMAIL_NOT_ACCEPTED' });
      }
      return info;
    } catch (error) {
      // Do not automatically retry: a lost SMTP acknowledgement can still mean delivery.
      throw mailError('Email delivery failed. Check the SMTP configuration and retry.', error);
    }
  }

  async function verifyMail() {
    try {
      await transport().verify();
      return { host: config.smtp.host, port: config.smtp.port, from: config.from, contactEmail: config.contactEmail, warnings: config.warnings };
    } catch (error) {
      if (error.code === 'EMAIL_CONFIG') throw error;
      throw mailError('SMTP connection verification failed.', error);
    }
  }

  return { sendMail, verifyMail, assertConfigured };
}

const mailer = createMailer();

module.exports = { ...mailer, assertMailConfigured: mailer.assertConfigured, createMailer, errorDetails, logMailError };
