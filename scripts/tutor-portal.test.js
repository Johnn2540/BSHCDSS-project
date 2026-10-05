const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { createPortalFixture, resetFixture, state, password, content } = require('./fixtures/tutorPortal');
let server, base;
test.before(async () => { server = createPortalFixture().listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(resetFixture);
function client() {
  let cookie = '';
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, redirect: 'manual', headers: { ...options.headers, ...(cookie ? { cookie } : {}) } });
    const value = response.headers.get('set-cookie'); if (value) cookie = value.split(';')[0];
    return response;
  };
}
function token(html) { return /name="_csrf" value="([^"]+)"/.exec(html)[1]; }
async function login(role = 'tutor') {
  const request = client();
  const loginPage = await (await request('/login')).text();
  const response = await request('/login', { method: 'POST', body: new URLSearchParams({ _csrf: token(loginPage), email: role + '@example.test', password }) });
  return { request, response };
}

test('anonymous, pending and suspended users cannot enter the Tutor Portal', async () => {
  for (const route of ['/tutor', '/tutor/documents', '/tutor/reports', '/tutor/plans-and-activities', '/tutor/password']) {
    const response = await client()(route); assert.equal(response.status, 302); assert.equal(response.headers.get('location'), '/login');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  for (const role of ['pending', 'suspended']) {
    const { request, response } = await login(role); assert.equal(response.status, 403);
    assert.equal((await request('/tutor')).headers.get('location'), '/login');
  }
});

test('approved tutors can browse all three sections and drafts stay hidden', async () => {
  const { request, response } = await login(); assert.equal(response.headers.get('location'), '/tutor');
  const home = await request('/tutor'); assert.equal(home.status, 200); assert.equal(home.headers.get('cache-control'), 'private, no-store');
  const overview = await home.text(); assert.match(overview, /Documents/); assert.match(overview, /Reports/); assert.match(overview, /Plans and Activities/);
  assert.equal((overview.match(/class="[^"]*\btutor-resource-card\b[^"]*"/g) || []).length, 3);
  const docs = await (await request('/tutor/documents')).text(); assert.match(docs, /Curriculum guidance/); assert.match(docs, /Tutor guide/); assert.doesNotMatch(docs, /Training progress report|Quarterly work plan/);
  const reports = await (await request('/tutor/reports')).text(); assert.match(reports, /Training progress report/); assert.doesNotMatch(reports, /Unpublished report|Tutor guide|private-storage\.example/);
  assert.match(reports, /href="\/documents\/report\/download"/); assert.match(reports, /Updated/);
  const plans = await (await request('/tutor/plans-and-activities')).text(); assert.match(plans, /Quarterly work plan/); assert.doesNotMatch(plans, /Training progress report/);
});

test('resource searches and category filters stay within the selected section', async () => {
  const { request } = await login();
  const found = await (await request('/tutor/reports?q=training&category=Project+resources')).text();
  assert.match(found, /Training progress report/); assert.doesNotMatch(found, /Public project report/);
  const empty = await (await request('/tutor/reports?q=work+plan')).text(); assert.match(empty, /No matching files/); assert.doesNotMatch(empty, /Quarterly work plan/);
  const escaped = await (await request('/tutor/reports?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E')).text(); assert.match(escaped, /&lt;script&gt;/);
  state.documents = state.documents.filter((row) => row.portalSection !== 'REPORTS'); content.clearCache();
  assert.match(await (await request('/tutor/reports')).text(), /No reports have been published here yet/);
});

test('public curriculum queries exclude reports and plans; invalid section filters fail closed', async () => {
  const groups = await content.getDocuments(['PUBLIC']); assert.deepEqual(groups.flatMap((group) => group.documents.map((doc) => doc.id)), ['curriculum']);
  await assert.rejects(content.getDocuments(['PUBLIC'], 'UNKNOWN'), /Unknown resource section/);
});

test('tutors cannot edit resources, and private/draft file downloads enforce access', async () => {
  const { request } = await login();
  for (const route of ['/admin/documents', '/admin/reports', '/admin/plans', '/admin/reports/report/edit']) assert.equal((await request(route)).status, 403);
  const csrf = token(await (await request('/tutor/password')).text());
  assert.equal((await request('/admin/reports/report', { method: 'POST', body: new URLSearchParams({ _csrf: csrf, title: 'Unauthorized change' }) })).status, 403);
  assert.equal((await request('/documents/report/download')).status, 302);
  assert.equal((await request('/documents/draft/download')).status, 404);
  assert.equal((await client()('/documents/report/download')).headers.get('location'), '/login');
  assert.equal((await request('/tutor/reports', { method: 'POST', body: new URLSearchParams({ _csrf: csrf }) })).status, 404);
  assert.equal(state.documents.find((row) => row.id === 'report').title, 'Training progress report');
});

test('administrators get scoped lists, safe defaults and can move files between sections', async () => {
  const { request } = await login('admin');
  const list = await (await request('/admin/reports')).text(); assert.match(list, /Training progress report/); assert.match(list, /Unpublished report/); assert.doesNotMatch(list, /Quarterly work plan/);
  const form = await (await request('/admin/reports/new')).text(); assert.match(form, /value="REPORTS" selected/); assert.match(form, /value="TUTORS" selected/);
  assert.doesNotMatch(form, /name="isPublished"[^>]*checked/);
  assert.equal((await request('/admin/documents/report/edit')).status, 404);
  const edit = await (await request('/admin/reports/report/edit')).text();
  const response = await request('/admin/reports/report', { method: 'POST', body: new URLSearchParams({ _csrf: token(edit), title: 'Moved resource', category: 'Work plans', portalSection: 'PLANS_ACTIVITIES', audience: 'TUTORS', isPublished: 'on' }) });
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), '/admin/plans');
  assert.equal((await request('/admin/reports/report/edit')).status, 404);
  assert.match(await (await request('/admin/plans')).text(), /Moved resource/);
  assert.equal(state.documents.find((row) => row.id === 'report').filePublicId, 'fixture-private:report');
});

test('admin uploads, validation and failed replacements preserve file ownership', async () => {
  const { request } = await login('admin');
  let html = await (await request('/admin/reports/new')).text();
  const body = new FormData(); for (const [name, value] of Object.entries({ title: 'New report', category: 'Training', portalSection: 'REPORTS', audience: 'TUTORS', isPublished: 'on' })) body.set(name, value);
  body.set('file', new Blob(['%PDF-1.4\nfixture only\n%%EOF'], { type: 'application/pdf' }), 'report.pdf');
  const created = await request('/admin/reports?_csrf=' + token(html), { method: 'POST', body });
  assert.equal(created.status, 302); assert.equal(created.headers.get('location'), '/admin/reports');
  const row = state.documents.find((row) => row.title === 'New report'); assert.equal(row.portalSection, 'REPORTS'); assert.equal(row.audience, 'TUTORS'); assert.equal(row.isPublished, true);
  html = await (await request('/admin/reports/report/edit')).text();
  const invalid = await request('/admin/reports/report', { method: 'POST', body: new URLSearchParams({ _csrf: token(html), title: 'Bad section', category: 'Training', portalSection: 'ADMIN', audience: 'TUTORS' }) });
  assert.equal(invalid.status, 422); assert.equal(state.documents.find((row) => row.id === 'report').portalSection, 'REPORTS');
  state.failUpload = true;
  const replace = new FormData(); for (const [name, value] of Object.entries({ title: 'Replacement', category: 'Training', portalSection: 'REPORTS', audience: 'TUTORS' })) replace.set(name, value);
  replace.set('file', new Blob(['%PDF-1.4\nfixture'], { type: 'application/pdf' }), 'replacement.pdf');
  assert.equal((await request('/admin/reports/report?_csrf=' + token(html), { method: 'POST', body: replace })).status, 422);
  assert.equal(state.documents.find((row) => row.id === 'report').filePublicId, 'fixture-private:report');
  assert.ok(!state.events.includes('delete-file:fixture-private:report'));
  assert.equal((await request('/admin/reports/report', { method: 'POST', body: new URLSearchParams({ title: 'No CSRF' }) })).status, 403);
});

test('tutor password changes use the tutor form, require current credentials and revoke old access', async () => {
  const { request } = await login();
  let form = await (await request('/tutor/password')).text(); assert.match(form, /action="\/tutor\/password"/); assert.doesNotMatch(form, /action="\/admin\/password"/);
  const submit = (values) => request('/tutor/password', { method: 'POST', body: new URLSearchParams({ _csrf: token(form), ...values }) });
  assert.equal((await submit({ currentPassword: 'incorrect', newPassword: 'different-password-for-testing', confirmPassword: 'different-password-for-testing' })).status, 422);
  const long = 'é'.repeat(36) + 'A'; assert.equal((await submit({ currentPassword: password, newPassword: long, confirmPassword: long })).status, 422);
  const response = await submit({ currentPassword: password, newPassword: 'different-password-for-testing', confirmPassword: 'different-password-for-testing' });
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), '/tutor/password');
  assert.equal(await bcrypt.compare('different-password-for-testing', state.users.tutor.passwordHash), true);
  assert.ok(state.events.includes('revoke-tokens')); assert.ok(state.events.some((event) => event.sql?.includes('DELETE FROM "session"')));
  form = await (await request('/tutor/password')).text(); assert.doesNotMatch(form, /value="different-password/);
  const admin = await login('admin'); assert.match(await (await admin.request('/admin/password')).text(), /action="\/admin\/password"/);
});
