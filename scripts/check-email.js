// Read-only SMTP check. This does not send mail or create account tokens.
require('dotenv').config({ quiet: true });
const { verifyMail, errorDetails } = require('../src/services/mailer');

async function main() {
  if (process.argv.includes('--production') && process.env.VERCEL_ENV !== 'production') {
    console.log('SMTP build verification applies only to Vercel production deployments.');
    return;
  }
  const result = await verifyMail();
  console.log('SMTP connection, TLS and authentication verified. No email was sent.');
  console.log(`Server: ${result.host}:${result.port}\nRequested sender: ${result.from}\nContact recipient: ${result.contactEmail || 'site settings fallback'}`);
  result.warnings.forEach((warning) => console.warn(warning));
  console.log('SMTP verification does not confirm inbox delivery or the final sender header.');
}

main().catch((error) => {
  console.error('Email verification failed:', errorDetails(error));
  if (error.code === 'EMAIL_CONFIG') console.error(error.message);
  process.exitCode = 1;
});
