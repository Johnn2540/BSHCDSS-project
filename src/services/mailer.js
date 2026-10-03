const nodemailer = require('nodemailer');

const isProd = process.env.NODE_ENV === 'production';

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

async function sendMail({ to, replyTo, subject, text, html }) {
  if (!to) throw new Error('No recipient address configured.');
  if (!transporter) {
    if (isProd) throw new Error('SMTP is not configured; cannot send email.');
    // Development fallback: print the email so links (e.g. password reset) can be tested.
    console.log(`\n[mail] SMTP not configured. Email to ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, replyTo, subject, text, html });
}

module.exports = { sendMail };
