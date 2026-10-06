const test = require('node:test');
const assert = require('node:assert/strict');
const { getEmailConfig } = require('../src/config/email');
const { createMailer, errorDetails } = require('../src/services/mailer');
const { accountEmail, contactEmail } = require('../src/services/emailTemplates');

const env = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop', MAIL_FROM: 'Test Site <sender@gmail.com>', CONTACT_EMAIL: 'contact@example.test' };

test('Gmail formatting spaces are removed, TLS is required, and other SMTP passwords retain spaces', () => {
  const config = getEmailConfig(env);
  assert.deepEqual(config.errors, []);
  assert.equal(config.smtp.auth.pass, 'abcdefghijklmnop');
  assert.equal(config.smtp.secure, false);
  assert.equal(config.smtp.requireTLS, true);
  assert.equal(getEmailConfig({ ...env, SMTP_HOST: 'smtp.example.test' }).smtp.auth.pass, env.SMTP_PASS);
  assert.equal(getEmailConfig({ ...env, SMTP_PORT: '465', SMTP_SECURE: '' }).smtp.secure, true);
});

test('invalid configuration fails before any SMTP connection', async () => {
  for (const input of [{}, { ...env, SMTP_PASS: '' }, { ...env, SMTP_PORT: 'invalid' }, { ...env, SMTP_SECURE: 'yes' }, { ...env, SMTP_PORT: '465' }, { ...env, SMTP_SECURE: 'true' }, { ...env, MAIL_FROM: 'a@example.test\r\nBcc: b@example.test' }, { ...env, CONTACT_EMAIL: 'invalid' }]) {
    const mailer = createMailer({ env: input, createTransport: () => { assert.fail('Invalid configuration must not connect'); } });
    await assert.rejects(mailer.sendMail({ to: 'tutor@example.test', subject: 'Invitation', text: 'Test' }), { code: 'EMAIL_CONFIG' });
  }
});

test('verification authenticates without sending and reports Gmail alias requirements without exposing credentials', async () => {
  let verified = 0;
  const mailer = createMailer({ env: { ...env, MAIL_FROM: 'Project <project@gmail.com>' }, createTransport: () => ({ verify: async () => { verified++; }, sendMail: () => assert.fail('Verification must not send') }) });
  const result = await mailer.verifyMail();
  assert.equal(verified, 1);
  assert.equal(result.from, 'Project <project@gmail.com>');
  assert.match(result.warnings[0], /alias/);
  assert.doesNotMatch(JSON.stringify(result), /abcdefghijklmnop|abcd efgh/);
});

test('SMTP rejection cannot produce a successful send, and uncertain failure is not automatically retried', async () => {
  let attempts = 0;
  const mailer = createMailer({ env, createTransport: () => ({ sendMail: async () => { attempts++; return { accepted: [], rejected: ['tutor@example.test'] }; } }) });
  await assert.rejects(mailer.sendMail({ to: 'tutor@example.test', subject: 'Test', text: 'Test' }), { code: 'EMAIL_NOT_ACCEPTED' });
  assert.equal(attempts, 1);
  const timeout = Object.assign(new Error('sensitive SMTP response'), { code: 'ETIMEDOUT', response: 'private token and credentials', command: 'DATA' });
  const failing = createMailer({ env, createTransport: () => ({ sendMail: async () => { attempts++; throw timeout; } }) });
  const error = await failing.sendMail({ to: 'tutor@example.test', subject: 'Test', text: 'Test' }).catch((error) => error);
  assert.equal(attempts, 2);
  assert.equal(error.code, 'ETIMEDOUT');
  assert.equal(error.command, 'DATA');
  assert.doesNotMatch(error.stack + JSON.stringify(error), /sensitive SMTP|private token/);
});

test('valid contact mail keeps the configured sender and the visitor reply address', async () => {
  let sent;
  const mailer = createMailer({ env, createTransport: () => ({ sendMail: async (message) => { sent = message; return { accepted: [message.to], messageId: 'fixture' }; } }) });
  const result = await mailer.sendMail({ to: 'contact@example.test', replyTo: { name: 'Visitor', address: 'visitor@example.test' }, ...contactEmail({ siteName: 'Test Site', name: 'Visitor', email: 'visitor@example.test', subject: 'Question', message: 'Please contact me.' }) });
  assert.equal(result.messageId, 'fixture');
  assert.equal(sent.from, env.MAIL_FROM);
  assert.equal(sent.replyTo.address, 'visitor@example.test');
  assert.match(sent.html, /New contact message/);
});

test('message header injection is rejected before SMTP; HTML escapes submitted names and messages', async () => {
  const mailer = createMailer({ env, createTransport: () => assert.fail('Must reject before connecting') });
  await assert.rejects(mailer.sendMail({ to: 'tutor@example.test', subject: 'Test\r\nBcc: attacker@example.test' }), { code: 'EMESSAGE' });
  await assert.rejects(mailer.sendMail({ to: 'tutor@example.test\r\nBcc: attacker@example.test', subject: 'Test' }), { code: 'EMESSAGE' });
  const message = contactEmail({ siteName: '<script>brand</script>', name: '<img src=x onerror=alert(1)>', email: 'visitor@example.test', subject: 'Hello\r\nBcc: attacker', message: '<script>alert(1)</script>\nSecond line' });
  assert.doesNotMatch(message.html, /<script>|<img/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.doesNotMatch(message.subject, /[\r\n]/);
  const invite = accountEmail({ kind: 'invite', name: '<script>name</script>', email: 'tutor@example.test', url: 'https://site.example.test/reset-password/fixture', expiresIn: '72 hours' });
  assert.match(invite.html, /&lt;script&gt;name/);
  assert.match(invite.html, /href="https:\/\/site.example.test\/reset-password\/fixture"/);
  assert.match(invite.text, /72 hours/);
});

test('error summaries exclude raw provider responses, recipient addresses, and authentication payloads', () => {
  assert.deepEqual(errorDetails({ code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN', response: 'private response', password: 'secret' }), { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN' });
  assert.deepEqual(errorDetails({ code: 'bad\nsecret', command: 'AUTH PLAIN secret' }), { code: 'EMAIL_DELIVERY' });
});
