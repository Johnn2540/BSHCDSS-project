// End to end: a visitor asks for tutor access, an administrator reviews the request, and approving it creates the
// account and sends the invitation. Real routes, sessions, CSRF and views; isolated in-memory persistence.
// Email is captured in memory, so no message is ever sent and no production data is touched.
const test = require('node:test');
const assert = require('node:assert/strict');

const sent = { mail: [], invites: [], failMail: false, failInvite: false };
function stub(request, exports) {
  const resolved = require.resolve(request);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stub('../src/services/mailer', {
  sendMail: async (message) => { if (sent.failMail) throw new Error('SMTP down'); sent.mail.push(message); return { accepted: [message.to] }; },
  assertMailConfigured() {}, createMailer() {}, errorDetails: () => ({}), logMailError() {},
});
stub('../src/services/passwordTokens', {
  hashToken: (value) => value, createToken: async () => 't'.repeat(64), findValidToken: async () => null, sendResetEmail: async () => {},
  sendInviteEmail: async (req, user) => { if (sent.failInvite) throw new Error('SMTP down'); sent.invites.push({ to: user.email, name: user.name }); },
  emailOrigin: () => 'https://kubshcdss.example',
});

const { createPortalFixture, resetFixture, state, password, prisma } = require('./fixtures/tutorPortal');
const { tutorRequestLimiter } = require('../src/middleware/rateLimits');
const { MAX_PENDING_REQUESTS } = require('../src/controllers/tutorRequestController');
const { tutorRequestEmail } = require('../src/services/emailTemplates');
const seoRules = require('../src/middleware/seo');
const security = require('../src/middleware/security');

let server, base;
test.before(async () => {
  server = createPortalFixture().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => {
  resetFixture();
  sent.mail = []; sent.invites = []; sent.failMail = false; sent.failInvite = false;
  for (const key of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) tutorRequestLimiter.resetKey(key);
});

function client() {
  const jar = new Map();
  return async (path, options = {}) => {
    const cookie = [...jar].map(([name, value]) => name + '=' + value).join('; ');
    const response = await fetch(base + path, {
      ...options, redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { ...options.headers, ...(cookie ? { cookie } : {}) },
    });
    for (const line of response.headers.getSetCookie()) { const [pair] = line.split(';'); const at = pair.indexOf('='); jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    return response;
  };
}
const token = (html) => { const value = /name="_csrf" value="([^"]+)"/.exec(html)?.[1]; assert(value, 'the page carries a CSRF token'); return value; };
const form = (csrf, fields) => new URLSearchParams({ ...(csrf ? { _csrf: csrf } : {}), ...fields });
async function login(key) {
  const request = client();
  const page = await (await request('/login')).text();
  const response = await request('/login', { method: 'POST', body: form(token(page), { email: key + '@example.test', password }) });
  assert.equal(response.status, 302, 'login as ' + key);
  return request;
}
const valid = { name: 'Grace Achol', email: 'grace@example.test', institution: 'Juba National Teacher Training Institute', phone: '+211 912 345 678', message: 'I teach primary mathematics.' };
async function visitor() {
  const request = client();
  const csrf = token(await (await request('/request-tutor-access')).text());
  const submit = (fields = valid, options = {}) => request('/request-tutor-access', { method: 'POST', body: form(options.noToken ? null : csrf, fields) });
  return { request, csrf, submit };
}
const adminCsrf = async (request) => token(await (await request('/admin/password')).text());
const accountWrites = () => state.userWrites.filter((write) => !write.data || !('lastLoginAt' in write.data));
const seed = (overrides = {}) => {
  const row = { id: 'request-' + (state.tutorRequests.length + 1), name: 'Peter Deng', email: 'peter@example.test', phone: null, institution: 'Wau Teacher Training College', message: null, status: 'PENDING', createdAt: new Date(Date.UTC(2026, 9, 1, 8, 0, state.tutorRequests.length)), reviewedAt: null, reviewedBy: null, approvedUserId: null, ...overrides };
  state.tutorRequests.push(row);
  return row;
};

// ── The visitor ────────────────────────────────────────────────────────────────────────────────────────
test('the request page is public, carries a CSRF token and a honeypot, and is kept out of search and shared caches', async () => {
  const response = await client()('/request-tutor-access');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const html = await response.text();
  assert.match(html, /<h1[^>]*>Request tutor access<\/h1>/);
  token(html);
  assert.match(html, /name="website"[^>]*tabindex="-1"/, 'honeypot field');
  for (const [field, autocomplete] of [['name', 'name'], ['email', 'email'], ['institution', 'organization'], ['phone', 'tel']]) {
    assert.match(html, new RegExp(`name="${field}"[^>]*autocomplete="${autocomplete}"`));
  }
  assert.doesNotMatch(html, /Request received/, 'the confirmation is not shown before a submission');

  const res = { locals: {}, set(name, value) { this.header = [name, value]; } };
  seoRules.indexingRules({ path: '/request-tutor-access', method: 'GET' }, res, () => {});
  assert.equal(res.locals.noindex, true, 'search engines are told not to index the form');
  const cache = { set(name, value) { this.header = [name, value]; } };
  security.privatePages({ path: '/request-tutor-access', user: null }, cache, () => {});
  assert.deepEqual(cache.header, ['Cache-Control', 'private, no-store']);
});

test('a valid request is stored for review, creates no account, notifies only the project mailbox and confirms once', async () => {
  const { request, csrf, submit } = await visitor();
  const response = await submit({ ...valid, name: '  Grace Achol  ', email: '  Grace@Example.TEST ' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/request-tutor-access');

  assert.equal(state.tutorRequests.length, 1);
  assert.deepEqual({ ...state.tutorRequests[0], id: undefined, createdAt: undefined }, {
    id: undefined, name: 'Grace Achol', email: 'grace@example.test', phone: '+211 912 345 678', institution: valid.institution, message: valid.message,
    status: 'PENDING', createdAt: undefined, reviewedAt: null, reviewedBy: null, approvedUserId: null,
  });
  assert.equal(accountWrites().length, 0, 'no account is created by a request');
  assert.equal(Object.keys(state.users).length, 6);

  assert.equal(sent.mail.length, 1, 'one notification');
  const message = sent.mail[0];
  assert.notEqual(message.to, 'grace@example.test', 'the applicant is never emailed at this stage');
  assert.match(message.to, /@/);
  assert.equal(message.subject, '[Website] Tutor access request from Grace Achol');
  assert.equal(message.replyTo.address, 'grace@example.test');
  assert.match(message.text, /https:\/\/kubshcdss\.example\/admin\/tutor-requests\/request-1/);
  assert.doesNotMatch(message.text + message.html, /password/i, 'no credentials of any kind');

  const confirmation = await (await request('/request-tutor-access')).text();
  assert.match(confirmation, /Request received/);
  assert.doesNotMatch(confirmation, /name="institution"/, 'the confirmation replaces the form');
  const again = await (await request('/request-tutor-access')).text();
  assert.match(again, /You have already sent a request/, 'reloading shows that one request is all a visitor can send');
  assert.doesNotMatch(again, /name="institution"|Request received/);

  const second = await request('/request-tutor-access', { method: 'POST', body: form(csrf, { ...valid, email: 'second@example.test' }) });
  assert.ok([302, 403].includes(second.status));
  assert.equal(state.tutorRequests.length, 1, 'a second request from the same browser is not stored');
});

test('submissions without a valid CSRF token are refused and store nothing', async () => {
  const { submit } = await visitor();
  assert.equal((await submit(valid, { noToken: true })).status, 403);
  const request = client();
  const response = await request('/request-tutor-access', { method: 'POST', body: form('not-a-real-token', valid) });
  assert.equal(response.status, 403);
  assert.equal(state.tutorRequests.length, 0);
  assert.equal(sent.mail.length, 0);
});

test('invalid input is rejected with messages, keeps what was typed, stores nothing and is escaped', async () => {
  const { submit } = await visitor();
  const response = await submit({ name: '', email: 'not-an-email', institution: '<script>alert(1)</script>', phone: 'call me', message: 'x'.repeat(1001) });
  assert.equal(response.status, 422);
  const html = await response.text();
  for (const message of ['Enter your full name.', 'Enter a valid email address.', 'Enter a valid phone number, or leave it blank.', 'Your message must be 1,000 characters or fewer.']) assert.match(html, new RegExp(message.replace(/[.,]/g, '\\$&')));
  assert.match(html, /Please correct the highlighted fields/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'typed text is escaped when shown again');
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.equal(state.tutorRequests.length, 0);

  const missingInstitution = await submit({ ...valid, institution: '   ' });
  assert.equal(missingInstitution.status, 422);
  assert.match(await missingInstitution.text(), /Tell us where you teach or work\./);
});

test('repeated or bracketed fields cannot slip past validation', async () => {
  const { request, csrf } = await visitor();
  const post = (body) => request('/request-tutor-access', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const repeated = await post(`_csrf=${csrf}&name=Ann&name=Bob&email=ann%40example.test&institution=College`);
  assert.equal(repeated.status, 422, 'a repeated name field is not a name');
  const bracketed = await post(`_csrf=${csrf}&name=Ann+Ade&email[]=a%40example.test&email[]=b%40example.test&institution=College`);
  assert.equal(bracketed.status, 422, 'an email list is not an email address');
  assert.equal(state.tutorRequests.length, 0);
});

test('the honeypot swallows bots: the same confirmation, nothing stored, nothing emailed', async () => {
  const { request, submit } = await visitor();
  const response = await submit({ ...valid, website: 'https://spam.example' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/request-tutor-access');
  assert.equal(state.tutorRequests.length, 0);
  assert.equal(sent.mail.length, 0);
  assert.match(await (await request('/request-tutor-access')).text(), /Request received/);
});

test('the response never reveals whether an email already has an account or a pending request', async () => {
  const outcomes = [];
  for (const email of ['brand-new@example.test', 'brand-new@example.test', 'tutor@example.test', 'ADMIN@example.test']) {
    const { request, submit } = await visitor();
    const response = await submit({ ...valid, email });
    outcomes.push({ status: response.status, location: response.headers.get('location'), page: (await (await request('/request-tutor-access')).text()).includes('Request received') });
  }
  assert.deepEqual(new Set(outcomes.map((outcome) => JSON.stringify(outcome))).size, 1, 'new, repeat and registered emails look identical');
  assert.deepEqual(state.tutorRequests.map((row) => row.email), ['brand-new@example.test'], 'only the first genuinely new request is stored');
  assert.equal(sent.mail.length, 1);
});

test('an email that has made a request before, whatever the outcome, cannot make another', async () => {
  seed({ email: 'old@example.test', status: 'DECLINED' });
  const { submit } = await visitor();
  assert.equal((await submit({ ...valid, email: 'old@example.test' })).status, 302);
  assert.equal(state.tutorRequests.length, 1);
  assert.equal(sent.mail.length, 0);
});

test('the page offers WhatsApp (when a number is set) and email as other ways to ask', async () => {
  const none = await (await client()('/request-tutor-access')).text();
  assert.match(none, /href="mailto:[^"]+"/);
  assert.doesNotMatch(none, /wa\.me/, 'no WhatsApp button until a number is saved in Site settings');
  const content = require('../src/services/content');
  const original = content.getSite;
  content.getSite = async () => { const site = await original(); return { ...site, contact: { ...site.contact, whatsappUrl: 'https://wa.me/211926540368' } }; };
  try {
    const html = await (await client()('/request-tutor-access')).text();
    assert.match(html, /href="https:\/\/wa\.me\/211926540368\?text(=|&#x3D;)Hello[^"]*"[^>]*rel="noopener noreferrer"/);
  } finally { content.getSite = original; }
});

test('a cap on unreviewed requests stops a flood from growing the table', async () => {
  for (let i = 0; i < MAX_PENDING_REQUESTS; i++) seed({ id: 'bulk-' + i, email: `bulk${i}@example.test` });
  const { submit } = await visitor();
  const response = await submit({ ...valid, email: 'one-more@example.test' });
  assert.equal(response.status, 302, 'the visitor still sees the normal confirmation');
  assert.equal(state.tutorRequests.length, MAX_PENDING_REQUESTS);
});

test('a problem sending the notification email never loses the request or alarms the visitor', async () => {
  sent.failMail = true;
  const { submit } = await visitor();
  const response = await submit();
  assert.equal(response.status, 302);
  assert.equal(state.tutorRequests.length, 1);
});

test('submissions are rate limited per visitor', async () => {
  const { request, csrf } = await visitor();
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    statuses.push((await request('/request-tutor-access', { method: 'POST', body: form(csrf, { ...valid, email: `bot${i}@example.test`, website: 'x' }) })).status);
  }
  assert.deepEqual(statuses, [302, 302, 302, 302, 302, 429, 429], 'five a minute-hour, then "too many attempts"');
});

// ── The notification email ─────────────────────────────────────────────────────────────────────────────
test('the notification email escapes everything a visitor typed and cannot gain extra headers', () => {
  const email = tutorRequestEmail({
    siteName: 'BSHCDSS', name: 'Eve\r\nBcc: attacker@example.test', email: 'eve@example.test', phone: '', institution: '<b>College</b>',
    message: '<script>alert(1)</script>\n<img src=x onerror=alert(2)>', reviewUrl: 'https://kubshcdss.example/admin/tutor-requests/x"onmouseover="1',
  });
  assert.ok(!/[\r\n]/.test(email.subject), 'a single-line subject');
  assert.match(email.subject, /Eve Bcc: attacker@example\.test/);
  assert.doesNotMatch(email.html, /<script>|<img |<b>College/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.doesNotMatch(email.html, /href="[^"]*"onmouseover/, 'the link cannot break out of its attribute');
  const withoutLink = tutorRequestEmail({ siteName: 'BSHCDSS', name: 'A', email: 'a@example.test', institution: 'B', reviewUrl: null });
  assert.match(withoutLink.text, /Open Tutor requests in the admin panel/);
});

// ── Access control ─────────────────────────────────────────────────────────────────────────────────────
test('only administrators can reach any tutor-request page or action', async () => {
  const row = seed();
  const targets = [['GET', '/admin/tutor-requests'], ['GET', '/admin/tutor-requests/' + row.id], ['POST', '/admin/tutor-requests/' + row.id + '/approve'],
    ['POST', '/admin/tutor-requests/' + row.id + '/decline'], ['GET', '/admin/tutor-requests/' + row.id + '/delete'], ['POST', '/admin/tutor-requests/' + row.id + '/delete']];

  const anonymous = client();
  for (const [method, path] of targets) {
    const response = await anonymous(path, { method, ...(method === 'POST' ? { body: form('x', {}) } : {}) });
    assert.ok([302, 403].includes(response.status), `anonymous ${method} ${path}`);
    if (response.status === 302) assert.equal(response.headers.get('location'), '/login');
  }
  for (const who of ['tutor', 'delegated']) {
    const request = await login(who);
    const csrf = who === 'delegated' ? await adminCsrf(request) : token(await (await request('/tutor/password')).text());
    for (const [method, path] of targets) {
      const response = await request(path, { method, ...(method === 'POST' ? { body: form(csrf, {}) } : {}) });
      assert.equal(response.status, 403, `${who} ${method} ${path}`);
    }
  }
  assert.equal(state.tutorRequests[0].status, 'PENDING');
  assert.equal(accountWrites().length, 0);

  const admin = await login('admin');
  assert.equal((await admin('/admin/tutor-requests')).status, 200);
  assert.equal((await admin('/admin/tutor-requests/' + row.id)).status, 200);
});

test('state-changing actions need POST and a CSRF token; GET cannot approve, decline or delete', async () => {
  const row = seed();
  const admin = await login('admin');
  assert.equal((await admin(`/admin/tutor-requests/${row.id}/decline`)).status, 404, 'GET decline is not a route');
  const prompt = await admin(`/admin/tutor-requests/${row.id}/approve`);
  assert.equal(prompt.status, 200, 'GET approve only shows the question');
  assert.match(await prompt.text(), /Send the invitation email to/);
  for (const action of ['approve', 'decline']) {
    assert.equal((await admin(`/admin/tutor-requests/${row.id}/${action}`, { method: 'POST', body: form(null, {}) })).status, 403, `POST ${action} without a token`);
  }
  const csrf = await adminCsrf(admin);
  for (const fields of [{}, { sendInvite: 'maybe' }, { sendInvite: '' }]) {
    const response = await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(csrf, fields) });
    assert.equal(response.headers.get('location'), `/admin/tutor-requests/${row.id}/approve`, 'no explicit yes or no: asked again');
  }
  assert.equal(accountWrites().length, 0);
  assert.equal((await admin(`/admin/tutor-requests/${row.id}/delete`, { method: 'POST', body: form(null, {}) })).status, 403);
  assert.equal(state.tutorRequests[0].status, 'PENDING');
  assert.equal(accountWrites().length, 0);
});

test('unknown or malformed request ids are a plain 404', async () => {
  const admin = await login('admin');
  const csrf = await adminCsrf(admin);
  for (const id of ['missing', '..%2F..%2Fetc', "x'%20OR%20'1'='1", '%00', 'a'.repeat(200)]) {
    assert.equal((await admin('/admin/tutor-requests/' + id)).status, 404, 'show ' + id);
    assert.equal((await admin(`/admin/tutor-requests/${id}/approve`, { method: 'POST', body: form(csrf, { sendInvite: 'yes' }) })).status, 404, 'approve ' + id);
  }
});

// ── The administrator ──────────────────────────────────────────────────────────────────────────────────
test('the list opens on pending requests, filters by status, counts them and escapes hostile text', async () => {
  seed({ name: '<img src=x onerror=alert(1)>', email: 'xss@example.test' });
  seed({ name: 'Approved Person', email: 'approved@example.test', status: 'APPROVED', reviewedAt: new Date(), reviewedBy: 'Project Administrator' });
  seed({ name: 'Declined Person', email: 'declined@example.test', status: 'DECLINED', reviewedAt: new Date(), reviewedBy: 'Project Administrator' });
  const admin = await login('admin');

  const pending = await (await admin('/admin/tutor-requests')).text();
  assert.match(pending, /&lt;img src(=|&#x3D;)x/);
  assert.doesNotMatch(pending, /<img src=x/);
  assert.doesNotMatch(pending, /Approved Person|Declined Person/);
  assert.match(pending, /Pending <span class="tab-count">1<\/span>/);
  assert.match(pending, /Approved <span class="tab-count">1<\/span>/);
  assert.match(pending, /All <span class="tab-count">3<\/span>/);
  assert.match(pending, /href="\/admin\/tutor-requests\/request-1\/approve"/);

  const approved = await (await admin('/admin/tutor-requests?status=APPROVED')).text();
  assert.match(approved, /Approved Person/);
  assert.doesNotMatch(approved, /xss@example\.test|href="\/admin\/tutor-requests\/[^"]+\/approve"/, 'decided requests offer no approve action');
  assert.match((await (await admin('/admin/tutor-requests?status=ALL')).text()), /Declined Person/);
  assert.match((await (await admin('/admin/tutor-requests?status=DROP%20TABLE')).text()), /xss@example\.test/, 'an unknown status falls back to pending');
});

test('approving creates an active tutor, records the decision, emails one invitation and cannot be repeated', async () => {
  const row = seed({ name: 'Grace Achol', email: 'grace@example.test', phone: '+211 912 345 678', institution: 'Juba NTTI' });
  const admin = await login('admin');
  const csrf = await adminCsrf(admin);

  const response = await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(csrf, { sendInvite: 'yes', role: 'ADMIN', status: 'SUSPENDED', canManageContent: 'true' }) });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/tutor-requests');

  const created = Object.values(state.users).find((user) => user.email === 'grace@example.test');
  assert.ok(created, 'an account was created');
  assert.equal(created.role, 'TUTOR', 'forged form fields cannot change the role');
  assert.equal(created.status, 'ACTIVE');
  assert.equal(created.canManageContent, false);
  assert.equal(created.name, 'Grace Achol');
  assert.equal(created.institution, 'Juba NTTI');
  assert.equal(created.phone, '+211 912 345 678');
  assert.match(created.passwordHash, /^\$2[aby]\$/, 'a bcrypt hash of a random value, not a usable password');

  assert.equal(row.status, 'APPROVED');
  assert.equal(row.reviewedBy, 'Project Administrator');
  assert.ok(row.reviewedAt instanceof Date);
  assert.equal(row.approvedUserId, created.id);
  assert.deepEqual(sent.invites, [{ to: 'grace@example.test', name: 'Grace Achol' }]);

  const next = await (await admin('/admin/tutor-requests')).text();
  assert.match(next, /Grace Achol approved and their tutor account created\. An invitation email/);

  const again = await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(csrf, { sendInvite: 'yes' }) });
  assert.equal(again.status, 302);
  assert.match(await (await admin('/admin/tutor-requests')).text(), /already been reviewed/);
  assert.equal(Object.values(state.users).filter((user) => user.email === 'grace@example.test').length, 1);
  assert.equal(sent.invites.length, 1, 'no second invitation');
});

test('approving without sending leaves the account created, the request approved and no email sent', async () => {
  const row = seed();
  const admin = await login('admin');
  await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(await adminCsrf(admin), { sendInvite: 'no' }) });
  assert.equal(row.status, 'APPROVED');
  assert.ok(Object.values(state.users).some((user) => user.email === row.email && user.status === 'ACTIVE'));
  assert.equal(sent.invites.length, 0);
  assert.match(await (await admin('/admin/tutor-requests')).text(), /No invitation email was sent/);
});

test('a request whose email already has an account cannot be approved and stays pending', async () => {
  const row = seed({ email: 'tutor@example.test' });
  const admin = await login('admin');
  const response = await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(await adminCsrf(admin), { sendInvite: 'yes' }) });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/tutor-requests/' + row.id);
  assert.match(await (await admin('/admin/tutor-requests/' + row.id)).text(), /already exists/);
  assert.equal(row.status, 'PENDING');
  assert.equal(accountWrites().length, 0);
  assert.equal(sent.invites.length, 0);
});

test('if the account cannot be created the claim is released and the request goes back to pending', async () => {
  const row = seed();
  const admin = await login('admin');
  const csrf = await adminCsrf(admin);
  const original = prisma.user.create;
  prisma.user.create = async () => { throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }); };
  try {
    const response = await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(csrf, { sendInvite: 'yes' }) });
    assert.equal(response.status, 302);
  } finally { prisma.user.create = original; }
  assert.equal(row.status, 'PENDING');
  assert.equal(row.reviewedAt, null);
  assert.equal(row.reviewedBy, null);
  assert.equal(sent.invites.length, 0);
  assert.match(await (await admin('/admin/tutor-requests/' + row.id)).text(), /already exists/);

  const retry = await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(csrf, { sendInvite: 'yes' }) });
  assert.equal(retry.status, 302);
  assert.equal(row.status, 'APPROVED', 'the request can be approved normally afterwards');
});

test('two administrators approving at once create one account', async () => {
  const row = seed();
  const [first, second] = [await login('admin'), await login('admin')];
  const [csrfOne, csrfTwo] = [await adminCsrf(first), await adminCsrf(second)];
  await Promise.all([
    first(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(csrfOne, { sendInvite: 'yes' }) }),
    second(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(csrfTwo, { sendInvite: 'yes' }) }),
  ]);
  assert.equal(Object.values(state.users).filter((user) => user.email === row.email).length, 1);
  assert.equal(sent.invites.length, 1);
  assert.equal(row.status, 'APPROVED');
});

test('an invitation email failure leaves the account created and tells the administrator how to recover', async () => {
  sent.failInvite = true;
  const row = seed();
  const admin = await login('admin');
  await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(await adminCsrf(admin), { sendInvite: 'yes' }) });
  assert.equal(row.status, 'APPROVED');
  assert.ok(Object.values(state.users).some((user) => user.email === row.email && user.status === 'ACTIVE'));
  const page = await (await admin('/admin/tutor-requests')).text();
  assert.match(page, /could not be sent/);
  assert.match(page, /Resend invitation/);
});

test('declining records the decision, creates nothing and sends nothing', async () => {
  const row = seed();
  const admin = await login('admin');
  const csrf = await adminCsrf(admin);
  const response = await admin(`/admin/tutor-requests/${row.id}/decline`, { method: 'POST', body: form(csrf, {}) });
  assert.equal(response.status, 302);
  assert.equal(row.status, 'DECLINED');
  assert.equal(row.reviewedBy, 'Project Administrator');
  assert.equal(accountWrites().length, 0);
  assert.equal(sent.invites.length + sent.mail.length, 0);
  assert.match(await (await admin('/admin/tutor-requests')).text(), /was declined\. No email was sent/);

  await admin(`/admin/tutor-requests/${row.id}/approve`, { method: 'POST', body: form(csrf, { sendInvite: 'yes' }) });
  assert.equal(row.status, 'DECLINED', 'a declined request cannot be approved afterwards');
  assert.equal(accountWrites().length, 0);
});

test('requests can be deleted after a confirmation page, without touching the account made from them', async () => {
  const row = seed({ status: 'APPROVED', approvedUserId: 'tutor' });
  const admin = await login('admin');
  const confirm = await (await admin(`/admin/tutor-requests/${row.id}/delete`)).text();
  assert.match(confirm, /Delete tutor request/);
  assert.match(confirm, /Peter Deng \(peter@example\.test\)/);
  assert.match(confirm, /not affected/);
  assert.equal(state.tutorRequests.length, 1, 'viewing the confirmation deletes nothing');

  const response = await admin(`/admin/tutor-requests/${row.id}/delete`, { method: 'POST', body: form(await adminCsrf(admin), {}) });
  assert.equal(response.status, 302);
  assert.equal(state.tutorRequests.length, 0);
  assert.ok(state.users.tutor, 'the tutor account remains');
});

test('the detail page shows the full message safely and offers the right actions for each state', async () => {
  const pending = seed({ message: 'Line one\n\n<b>bold</b> line two', phone: '+211 912 345 678' });
  const decided = seed({ email: 'done@example.test', status: 'APPROVED', approvedUserId: 'tutor', reviewedAt: new Date(), reviewedBy: 'Project Administrator' });
  const admin = await login('admin');

  const html = await (await admin('/admin/tutor-requests/' + pending.id)).text();
  assert.match(html, /Line one/);
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt; line two/);
  assert.doesNotMatch(html, /<b>bold<\/b>/);
  assert.match(html, /href="mailto:peter@example\.test"/);
  assert.match(html, /href="\/admin\/tutor-requests\/request-1\/approve"/);
  assert.match(html, /action="\/admin\/tutor-requests\/request-1\/decline"/);

  const done = await (await admin('/admin/tutor-requests/' + decided.id)).text();
  assert.doesNotMatch(done, /\/approve"|\/decline"/, 'no decision buttons once decided');
  assert.match(done, /Open the tutor account/);
});

test('the dashboard and navigation point administrators to waiting requests, and nobody else', async () => {
  seed(); seed({ email: 'second@example.test', name: 'Second Person' });
  const admin = await login('admin');
  const dashboard = await (await admin('/admin')).text();
  assert.match(dashboard, /2 requests for tutor access to review/);
  assert.match(dashboard, /href="\/admin\/tutor-requests\/request-1"/);
  assert.match(dashboard, /href="\/admin\/tutor-requests"[^>]*>\s*<svg[\s\S]*?Tutor requests/, 'sidebar link');

  const delegated = await login('delegated');
  const theirs = await (await delegated('/admin')).text();
  assert.doesNotMatch(theirs, /tutor-requests|tutor access|Peter Deng|Second Person/);
});

test('visitors are pointed to the form from the login page, the curriculum tutor notice and the footer', async () => {
  const login = await (await client()('/login')).text();
  assert.match(login, /href="\/request-tutor-access"[^>]*>Request tutor access</);
  assert.doesNotMatch(login, /Contact the project team if you need access/);
});
