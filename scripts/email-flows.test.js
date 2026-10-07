// All accounts, tokens and SMTP delivery in this file are isolated in-memory fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { engine } = require('express-handlebars');

process.env.SESSION_SECRET = 'isolated-email-fixture-only';

Object.assign(process.env, { NODE_ENV: 'test', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'sender@example.test', SMTP_PASS: 'fixture-only', MAIL_FROM: 'Example Project <sender@example.test>', CONTACT_EMAIL: 'contact@example.test', APP_URL: 'https://site.example.test' });
const initialUser = { id: 'tutor', name: 'Example Tutor', email: 'tutor@example.test', role: 'TUTOR', status: 'ACTIVE', passwordHash: bcrypt.hashSync('fixture-initial-password', 4) };
const state = { users: [], tokens: [], messages: [], failure: null, reject: false, sessionsRevoked: false, nextId: 0 };
function matches(row, where) {
  return Object.entries(where || {}).every(([key, value]) => value && typeof value === 'object' ? row[key] !== value.not : row[key] === value);
}
const prisma = {
  user: {
    findUnique: async ({ where }) => state.users.find((row) => matches(row, where)) || null,
    findFirst: async ({ where }) => state.users.find((row) => matches(row, where)) || null,
    create: async ({ data }) => { const user = { id: `created-${++state.nextId}`, ...data }; state.users.push(user); return user; },
    update: async ({ where, data }) => { const user = state.users.find((row) => matches(row, where)); Object.assign(user, data); return user; },
  },
  passwordResetToken: {
    deleteMany: async ({ where }) => { const before = state.tokens.length; state.tokens = state.tokens.filter((row) => !matches(row, where)); return { count: before - state.tokens.length }; },
    create: async ({ data }) => { const row = { id: `token-${++state.nextId}`, usedAt: null, ...data }; state.tokens.push(row); return row; },
    findUnique: async ({ where }) => { const row = state.tokens.find((item) => matches(item, where)); return row ? { ...row, user: state.users.find((user) => user.id === row.userId) } : null; },
    update: async ({ where, data }) => { const row = state.tokens.find((item) => matches(item, where)); Object.assign(row, data); return row; },
  },
  $transaction: async (operations) => Promise.all(operations),
};
function mock(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
mock('../src/lib/db', { prisma, pool: { query: async () => { state.sessionsRevoked = true; return {}; } } });
const site = { shortName: 'Example Project', fullName: 'Example Project', ministry: 'Example Ministry', country: 'Example Country', contact: { email: 'fallback@example.test', phone: '', address: [] }, logoUrl: '/images/logo-placeholder.svg' };
const pageConfigs = require('../src/config/pages');
mock('../src/services/content', { getSite: async () => site, getPage: async (slug) => Object.fromEntries(pageConfigs.find((page) => page.slug === slug).fields.map((field) => [field.name, field.default ?? ''])) });
require('nodemailer').createTransport = () => ({
  sendMail: async (message) => {
    state.messages.push(message);
    if (state.failure) throw state.failure;
    return { accepted: state.reject ? [] : [message.to], rejected: state.reject ? [message.to] : [], messageId: 'fixture' };
  },
});
const publicController = require('../src/controllers/publicController');
const auth = require('../src/controllers/authController');
const tutors = require('../src/controllers/admin/tutorsController');
const tokens = require('../src/services/passwordTokens');
const security = require('../src/middleware/security');
const helpers = require('../src/helpers/handlebars');
let server;
let base;

test.before(async () => {
  const app = express();
  app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', layoutsDir: path.join(__dirname, '../src/views/layouts'), partialsDir: path.join(__dirname, '../src/views/partials'), helpers }));
  app.set('view engine', 'hbs'); app.set('views', path.join(__dirname, '../src/views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'isolated-email-fixture-only', resave: false, saveUninitialized: false }));
  app.use(require('../src/middleware/flash'), security.csrfProtection);
  app.use((req, res, next) => { Object.assign(res.locals, { site, navigation: [], currentPath: req.path, baseUrl: base }); next(); });
  app.get('/contact', security.provideCsrfToken, publicController.showContact);
  app.post('/contact', publicController.contactRules, publicController.submitContact);
  app.get('/forgot-password', security.provideCsrfToken, auth.showForgot);
  app.post('/forgot-password', auth.forgotRules, auth.forgot);
  app.get('/reset-password/:token', security.provideCsrfToken, auth.showReset);
  app.post('/reset-password/:token', auth.resetRules, auth.reset);
  app.get('/admin/tutors/new', security.provideCsrfToken, tutors.newForm);
  app.post('/admin/tutors/new', tutors.createRules, tutors.create);
  app.post('/admin/tutors/:id/approve', tutors.approve);
  app.post('/admin/tutors/:id/invite', tutors.resendInvite);
  app.get('/fixture/flash', (req, res) => res.json(res.locals.flash));
  app.use((error, req, res, next) => res.status(error.status || 500).send('Fixture error'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
test.beforeEach(() => {
  Object.assign(state, { users: [{ ...initialUser }], tokens: [], messages: [], failure: null, reject: false, sessionsRevoked: false, nextId: 0 });
  process.env.APP_URL = 'https://site.example.test';
  process.env.NODE_ENV = 'test';
  process.env.CONTACT_EMAIL = 'contact@example.test';
});

async function form(route, fields, submitTo = route) {
  const page = await fetch(base + route);
  const html = await page.text();
  assert.equal(page.status, 200);
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf, 'The actual rendered form must include CSRF protection');
  const cookie = page.headers.get('set-cookie').split(';')[0];
  const response = await fetch(base + submitTo, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ _csrf: csrf, ...fields }), redirect: 'manual' });
  return { response, html: await response.text(), cookie };
}
const contactFields = { name: 'Example Visitor', email: 'visitor@example.test', subject: 'Training question', message: 'Please share the upcoming training dates.', phone: '', website: '' };

test('contact submission sends HTML and plain text to the project inbox with visitor Reply-To', async () => {
  const result = await form('/contact', contactFields);
  assert.equal(result.response.status, 302);
  assert.equal(state.messages.length, 1);
  const message = state.messages[0];
  assert.equal(message.to, 'contact@example.test');
  assert.equal(message.from, process.env.MAIL_FROM);
  assert.deepEqual(message.replyTo, { name: contactFields.name, address: contactFields.email });
  assert.match(message.text, /upcoming training dates/);
  assert.match(message.html, /upcoming training dates/);
});

test('partnership enquiries prefill the editable subject and preserve visitor edits through validation and delivery', async () => {
  const defaultSubject = pageConfigs.find(page => page.slug === 'contact').fields.find(field => field.name === 'partnershipSubject').default;
  for (const [query, expected] of [
    ['?enquiry=partnership', defaultSubject], ['', ''], ['?enquiry=unknown&subject=Injected', ''],
    ['?enquiry=partnership&enquiry=other', ''],
  ]) {
    const response = await fetch(base + '/contact' + query);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /id="contact-form"/);
    const input = /<input[^>]*name="subject"[^>]*>/.exec(html)?.[0];
    assert(input);
    assert.equal(/value="([^"]*)"/.exec(input)?.[1] || '', expected);
  }
  const fields = { ...contactFields, subject: 'Partnership with Example Institution' };
  const invalid = await form('/contact?enquiry=partnership', { ...fields, email: 'invalid' }, '/contact');
  assert.equal(invalid.response.status, 422);
  assert.match(invalid.html, /value="Partnership with Example Institution"/);
  assert.equal(state.messages.length, 0);
  const result = await form('/contact?enquiry=partnership', fields, '/contact');
  assert.equal(result.response.status, 302);
  assert.equal(state.messages.length, 1);
  assert.match(state.messages[0].subject, /Partnership with Example Institution/);
});

test('contact rejects invalid input and honeypot submissions without sending', async () => {
  assert.equal((await form('/contact', { ...contactFields, email: 'invalid' })).response.status, 422);
  assert.equal((await form('/contact', { ...contactFields, website: 'spam' })).response.status, 302);
  assert.equal(state.messages.length, 0);
});

test('contact delivery falls back to the editable site inbox when CONTACT_EMAIL is empty', async () => {
  process.env.CONTACT_EMAIL = '';
  assert.equal((await form('/contact', contactFields)).response.status, 302);
  assert.equal(state.messages[0].to, site.contact.email);
});

test('failed contact delivery preserves the message and points to the configured project inbox', async () => {
  state.reject = true;
  const result = await form('/contact', contactFields);
  assert.equal(result.response.status, 503);
  assert.match(result.html, /contact@example\.test/);
  assert.match(result.html, /upcoming training dates/);
  assert.doesNotMatch(result.html, /message has been sent/);
});

test('password recovery emails contain a working single-use link from APP_URL and revoke sessions after use', async () => {
  const result = await form('/forgot-password', { email: initialUser.email });
  assert.equal(result.response.status, 200);
  assert.equal(state.messages.length, 1);
  const message = state.messages[0];
  const raw = message.text.match(/https:\/\/site\.example\.test\/reset-password\/([a-f0-9]{64})/)[1];
  assert.equal(message.to, initialUser.email);
  assert.match(message.subject, /Example Project/);
  assert.match(message.html, new RegExp(raw));
  assert.equal(state.tokens[0].tokenHash, tokens.hashToken(raw));
  assert.ok(!JSON.stringify(state.tokens).includes(raw));
  const password = 'replacement-password-123';
  const reset = await form('/reset-password/' + raw, { password, confirmPassword: password });
  assert.equal(reset.response.status, 302);
  assert.equal(reset.response.headers.get('location'), '/login');
  assert.ok(await bcrypt.compare(password, state.users[0].passwordHash));
  assert.equal(state.sessionsRevoked, true);
  assert.equal(await tokens.findValidToken(raw), null);
});

test('unknown, pending, suspended and failed recovery attempts retain the same public confirmation', async () => {
  const known = await form('/forgot-password', { email: initialUser.email });
  const confirmation = known.html.match(/If an active account[^<]+/)[0];
  for (const status of ['PENDING', 'SUSPENDED']) {
    state.users[0].status = status;
    assert.match((await form('/forgot-password', { email: initialUser.email })).html, new RegExp(confirmation));
  }
  assert.match((await form('/forgot-password', { email: 'unknown@example.test' })).html, new RegExp(confirmation));
  assert.equal(state.messages.length, 1);
  state.users[0].status = 'ACTIVE';
  state.failure = Object.assign(new Error('private provider response'), { code: 'EAUTH', responseCode: 535 });
  const failed = await form('/forgot-password', { email: initialUser.email });
  assert.equal(failed.response.status, 200);
  assert.match(failed.html, new RegExp(confirmation));
  assert.doesNotMatch(failed.html, /private provider response|EAUTH/);
  assert.equal(state.tokens.length, 0);
});

test('admin-created active tutors receive password setup; pending tutors receive no invitation', async () => {
  const result = await form('/admin/tutors/new', { name: 'New Tutor', email: 'new@example.test', status: 'ACTIVE', institution: '', phone: '' });
  assert.equal(result.response.status, 302);
  assert.equal(state.messages.length, 1);
  const raw = state.messages[0].text.match(/reset-password\/([a-f0-9]{64})/)[1];
  assert.equal(state.messages[0].to, 'new@example.test');
  assert.match(state.messages[0].html, /Choose your password/);
  assert.match(state.messages[0].text, /72 hours/);
  assert.ok(await tokens.findValidToken(raw));
  assert.equal((await form('/admin/tutors/new', { name: 'Pending Tutor', email: 'pending@example.test', status: 'PENDING', institution: '', phone: '' })).response.status, 302);
  assert.equal(state.messages.length, 1);
});

test('failed tutor invitations are visible to admins and can be retried safely', async () => {
  state.failure = Object.assign(new Error('private provider response'), { code: 'EAUTH', responseCode: 535 });
  const result = await form('/admin/tutors/new', { name: 'New Tutor', email: 'new@example.test', status: 'ACTIVE', institution: '', phone: '' });
  assert.equal(result.response.status, 302);
  assert.equal(state.tokens.length, 0);
  const flash = await (await fetch(base + '/fixture/flash', { headers: { Cookie: result.cookie } })).json();
  assert.ok(flash.some((item) => item.type === 'error' && /Resend invitation/.test(item.message)));
  state.failure = null;
  await tokens.sendInviteEmail({ res: { locals: { site } } }, state.users.find((user) => user.email === 'new@example.test'));
  assert.equal(state.tokens.length, 1);
});

test('approval sends a setup link, resend replaces it, and suspended accounts cannot receive invitations', async () => {
  const tutor = { ...initialUser, id: 'pending', email: 'pending@example.test', status: 'PENDING' };
  state.users.push(tutor);
  assert.equal((await form('/admin/tutors/new', {}, '/admin/tutors/pending/approve')).response.status, 302);
  assert.equal(tutor.status, 'ACTIVE');
  const original = state.messages[0].text.match(/reset-password\/([a-f0-9]{64})/)[1];
  assert.ok(await tokens.findValidToken(original));
  assert.equal((await form('/admin/tutors/new', {}, '/admin/tutors/pending/invite')).response.status, 302);
  assert.equal(state.messages.length, 2);
  assert.equal(await tokens.findValidToken(original), null);
  tutor.status = 'SUSPENDED';
  assert.equal((await form('/admin/tutors/new', {}, '/admin/tutors/pending/invite')).response.status, 302);
  assert.equal(state.messages.length, 2);
});

test('account emails never trust request Host, and invalid production APP_URL cannot invalidate an existing link', async () => {
  await tokens.sendResetEmail({ protocol: 'https', get: () => 'attacker.example.test' }, state.users[0]);
  assert.match(state.messages[0].text, /https:\/\/site\.example\.test/);
  assert.doesNotMatch(state.messages[0].text, /attacker/);
  const existing = state.tokens[0].tokenHash;
  process.env.NODE_ENV = 'production'; process.env.APP_URL = 'http://site.example.test';
  await assert.rejects(tokens.sendResetEmail({}, state.users[0]), /APP_URL/);
  assert.equal(state.tokens[0].tokenHash, existing);
  assert.equal(state.messages.length, 1);
});

test('an SMTP timeout retains the token because the message may already have been accepted', async () => {
  state.failure = Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT', command: 'DATA' });
  await assert.rejects(tokens.sendResetEmail({}, state.users[0]), { code: 'ETIMEDOUT' });
  assert.equal(state.tokens.length, 1);
  assert.equal(state.messages.length, 1);
});

test('rejection cleanup preserves a newer token created during another delivery attempt', async () => {
  const newerHash = tokens.hashToken('newer-fixture-token');
  state.failure = Object.assign(new Error('Recipient rejected'), { code: 'EENVELOPE', responseCode: 550 });
  // Arrange a concurrent token just after this request's token was created.
  const create = prisma.passwordResetToken.create;
  prisma.passwordResetToken.create = async (input) => {
    const row = await create(input);
    state.tokens.push({ ...row, id: 'newer', tokenHash: newerHash });
    return row;
  };
  try {
    await assert.rejects(tokens.sendResetEmail({}, state.users[0]), { code: 'EENVELOPE' });
    assert.equal(state.tokens.length, 1);
    assert.equal(state.tokens[0].tokenHash, newerHash);
  } finally {
    prisma.passwordResetToken.create = create;
  }
});
