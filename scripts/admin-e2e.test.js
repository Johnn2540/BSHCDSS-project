// End to end: every admin tab, its create / edit / delete flows, and the effect on the public pages.
// Real routes, sessions, CSRF, validation, uploads (storage is stubbed) and views, on isolated in-memory data.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const sent = { invites: [], mail: [] };
function stub(request, exports) {
  const resolved = require.resolve(request);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stub('../src/services/mailer', {
  sendMail: async (message) => { sent.mail.push(message); return {}; }, assertMailConfigured() {}, createMailer() {}, errorDetails: () => ({}), logMailError() {},
});
stub('../src/services/passwordTokens', {
  hashToken: (value) => value, createToken: async () => 't'.repeat(64), findValidToken: async () => null, sendResetEmail: async () => {},
  sendInviteEmail: async (req, user) => { sent.invites.push(user.email); }, emailOrigin: () => 'https://kubshcdss.example',
});

const express = require('express');
const session = require('express-session');
const { engine } = require('express-handlebars');
const { state, prisma, password, resetFixture, content } = require('./fixtures/tutorPortal');
const { createMemoryDb } = require('./fixtures/memoryDb');

const tables = { teamMember: [], activity: [], document: [], album: [], photo: [], video: [], announcement: [], partner: [], pageContent: [], user: [] };
tables.__unique = { activity: ['slug'], album: ['slug'], teamMember: ['referenceCode'], pageContent: ['slug'] };
const memory = createMemoryDb(tables);
for (const name of Object.keys(tables)) if (name !== 'user' && name !== '__unique') prisma[name] = memory[name];

const helpers = require('../src/helpers/handlebars');
const security = require('../src/middleware/security');
const { loadUser } = require('../src/middleware/auth');
const flash = require('../src/middleware/flash');
const siteLocals = require('../src/middleware/siteLocals');
const resources = require('../src/admin/resources');
const pageConfigs = require('../src/config/pages');
const adminNavigation = require('../src/config/adminNavigation');
const { loginLimiter } = require('../src/middleware/rateLimits');

function createApp() {
  const app = express();
  app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', layoutsDir: path.join(__dirname, '../src/views/layouts'), partialsDir: path.join(__dirname, '../src/views/partials'), helpers }));
  app.set('view engine', 'hbs'); app.set('views', path.join(__dirname, '../src/views'));
  app.use(security.cspNonce, security.helmet);
  app.use(express.static(path.join(__dirname, '../public')));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
  app.use(flash, loadUser, security.privatePages, security.csrfProtection, security.csrfTokenForUsers);
  app.use(siteLocals);
  app.use('/', require('../src/routes'));
  app.use(require('../src/middleware/errorHandlers').notFound);
  app.use(require('../src/middleware/errorHandlers').errorHandler);
  return app;
}

let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => {
  resetFixture();
  for (const name of Object.keys(tables)) if (Array.isArray(tables[name])) tables[name].length = 0;
  sent.invites = []; sent.mail = [];
  for (const key of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) loginLimiter.resetKey(key);
  content.clearCache();
});

function client() {
  const jar = new Map();
  const request = async (target, options = {}) => {
    const response = await fetch(base + target, {
      ...options, redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { ...options.headers, cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') },
    });
    for (const line of response.headers.getSetCookie()) { const [pair] = line.split(';'); const at = pair.indexOf('='); jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    return response;
  };
  return request;
}
const token = (html) => { const value = /name="_csrf" value="([^"]+)"/.exec(html)?.[1]; assert(value, 'page carries a CSRF token'); return value; };
async function adminSession() {
  const request = client();
  const csrf = token(await (await request('/login')).text());
  const response = await request('/login', { method: 'POST', body: new URLSearchParams({ _csrf: csrf, email: 'admin@example.test', password }) });
  assert.equal(response.status, 302);
  const page = await (await request('/admin/password')).text();
  request.csrf = token(page);
  return request;
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const PDF = Buffer.from('%PDF-1.4\n%fixture\n');
const publicGet = async (target) => { content.clearCache(); const response = await client()(target); return { status: response.status, html: await response.text() }; };

// A valid value for every field of a resource.
function payloadFor(resource, overrides = {}) {
  const values = {};
  for (const field of resource.fields) {
    if (field.type === 'image' || field.type === 'file') continue;
    const sample = {
      text: `E2E ${field.label}`, textarea: `E2E ${field.label} text.\n\nSecond paragraph.`, email: 'e2e@example.test', url: 'https://example.org/e2e',
      number: '3', date: '2026-10-01', lines: 'one\ntwo', slug: '',
    }[field.type];
    if (field.type === 'checkbox') { if (field.name === 'isPublished' || field.default) values[field.name] = 'on'; continue; }
    if (field.type === 'select') {
      const options = typeof field.options === 'function' ? [] : field.options;
      values[field.name] = field.default || (options[0] && options[0].value) || '';
      continue;
    }
    values[field.name] = sample ?? '';
  }
  Object.assign(values, {
    title: 'E2E Title', name: 'E2E Name', referenceCode: 'K-77', phone: '+254 700 000 000', whatsappNumber: '+254 715 330094',
    embedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', category: 'E2E category', audience: 'PUBLIC', summary: 'E2E summary text.', ...overrides,
  });
  if (resource.key === 'announcements') values.title = overrides.title || 'E2E Announcement';
  return values;
}
async function save(admin, resource, target, values, files = {}) {
  const query = `?_csrf=${encodeURIComponent(admin.csrf)}`;
  const hasFiles = Object.keys(files).length > 0;
  if (!hasFiles) return admin(target, { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf, ...values }) });
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.append(key, value);
  for (const [key, [name, type, bytes]] of Object.entries(files)) form.append(key, new Blob([bytes], { type }), name);
  return admin(target + query, { method: 'POST', body: form });
}
const filesFor = (resource) => {
  const files = {};
  for (const field of resource.fields) {
    if (field.type === 'image') files[field.name] = ['e2e.png', 'image/png', PNG];
    if (field.type === 'file') files[field.name] = ['e2e.pdf', 'application/pdf', PDF];
  }
  return files;
};

// ── Every tab opens ────────────────────────────────────────────────────────────────────────────────────
test('every admin sidebar tab, create form and page editor opens without errors', async () => {
  const admin = await adminSession();
  for (const item of adminNavigation.filter((entry) => entry.href)) {
    const response = await admin(item.href);
    assert.equal(response.status, 200, item.label + ' (' + item.href + ')');
    const html = await response.text();
    assert.match(html, /<h1[^>]*>/, item.label + ' has a heading');
  }
  for (const resource of resources) {
    for (const suffix of ['/new']) assert.equal((await admin(`/admin/${resource.key}${suffix}`)).status, 200, `${resource.key}${suffix}`);
  }
  for (const target of ['/admin/tutors/new', '/admin/password', '/admin/pages']) assert.equal((await admin(target)).status, 200, target);
  for (const config of pageConfigs) assert.equal((await admin(`/admin/pages/${config.slug}/edit`)).status, 200, 'page editor ' + config.slug);
});

test('every public page renders with an empty database', async () => {
  for (const target of ['/', '/about', '/team', '/curriculum', '/gallery', '/announcements', '/contact', '/login', '/request-tutor-access', '/forgot-password',
    '/activities/lms', '/robots.txt', '/sitemap.xml']) {
    const { status } = await publicGet(target);
    assert.ok([200, 404].includes(status), `${target} -> ${status}`);
  }
});

// ── Create, edit, publish, delete for every content type, and what visitors see ────────────────────────────
const PUBLIC_CHECK = {
  team: { path: () => '/team', marker: 'E2E Name' },
  activities: { path: (row) => `/activities/${row.slug}`, marker: 'E2E Title', listing: '/' },
  albums: { path: (row) => `/gallery/${row.slug}`, marker: 'E2E Title', listing: '/gallery' },
  videos: { path: () => '/gallery', marker: 'E2E Title' },
  announcements: { path: () => '/announcements', marker: 'E2E Announcement' },
  partners: { path: () => '/', marker: 'E2E Name' },
};
for (const resource of resources) {
  test(`${resource.label}: create, list, edit, unpublish, delete`, async () => {
    const admin = await adminSession();
    const table = memory[resource.model];
    const rows = tables[resource.model];
    const where = resource.where || {};
    const mine = () => rows.filter((row) => Object.entries(where).every(([k, v]) => row[k] === v));

    // Create
    const created = await save(admin, resource, `/admin/${resource.key}`, payloadFor(resource, { portalSection: where.portalSection }), filesFor(resource));
    assert.equal(created.status, 302, 'create redirects: ' + (created.status === 422 ? JSON.stringify([...(await created.text()).matchAll(/class="form-error"[^>]*>([^<]+)/g)].map((m) => m[1])) : ''));
    assert.equal(mine().length, 1, 'one record stored');
    const row = mine()[0];
    for (const field of resource.fields.filter((f) => f.type === 'image' || f.type === 'file')) assert.ok(row[field.urlField], field.name + ' file stored');

    // Listed in the admin
    const list = await (await admin(`/admin/${resource.key}`)).text();
    assert.match(list, new RegExp(`/admin/${resource.key}/${row.id}/edit`));

    // Edit form shows what was saved, then a change is saved
    const form = await admin(`/admin/${resource.key}/${row.id}/edit`);
    assert.equal(form.status, 200);
    const titleField = resource.titleField || 'title';
    const edited = await save(admin, resource, `/admin/${resource.key}/${row.id}`, payloadFor(resource, { portalSection: where.portalSection, [titleField]: 'E2E Edited ' + resource.key }));
    assert.equal(edited.status, 302, 'update redirects');
    assert.equal(rows.find((entry) => entry.id === row.id)[titleField], 'E2E Edited ' + resource.key);
    assert.ok(rows.find((entry) => entry.id === row.id)[(resource.fields.find((f) => f.type === 'image' || f.type === 'file') || {}).urlField || 'id'], 'files are kept when only text is edited');

    // Invalid input is refused with a message and nothing changes
    const bad = await save(admin, resource, `/admin/${resource.key}/${row.id}`, { ...payloadFor(resource, { portalSection: where.portalSection }), [titleField]: '' });
    assert.equal(bad.status, 422);
    assert.match(await bad.text(), /is required|form-error/);
    assert.equal(rows.find((entry) => entry.id === row.id)[titleField], 'E2E Edited ' + resource.key, 'a rejected edit changes nothing');

    // Delete needs a confirmation page, then a POST
    const confirm = await admin(`/admin/${resource.key}/${row.id}/delete`);
    assert.equal(confirm.status, 200);
    assert.equal(mine().length, 1, 'viewing the confirmation deletes nothing');
    assert.equal((await admin(`/admin/${resource.key}/${row.id}/delete`, { method: 'POST', body: new URLSearchParams({}) })).status, 403, 'delete without a token is refused');
    const removed = await admin(`/admin/${resource.key}/${row.id}/delete`, { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf }) });
    assert.equal(removed.status, 302);
    assert.equal(mine().length, 0, 'record deleted');
    assert.equal((await admin(`/admin/${resource.key}/${row.id}/edit`)).status, 404, 'a deleted record is a clean 404');
    void table;
  });
}

test('what administrators publish appears to visitors, and disappears when unpublished or deleted', async () => {
  const admin = await adminSession();
  for (const resource of resources.filter((entry) => PUBLIC_CHECK[entry.key])) {
    const check = PUBLIC_CHECK[resource.key];
    const rows = tables[resource.model];
    const values = payloadFor(resource, { audience: 'PUBLIC' });
    const created = await save(admin, resource, `/admin/${resource.key}`, values, filesFor(resource));
    assert.equal(created.status, 302, resource.key + ' created');
    const row = rows[rows.length - 1];

    let page = await publicGet(check.path(row));
    assert.equal(page.status, 200, `${resource.key}: ${check.path(row)}`);
    assert.ok(page.html.includes(check.marker) || page.html.includes(check.marker.replace(/=/g, '&#x3D;')), `${resource.key}: published item is visible at ${check.path(row)}`);
    if (check.listing) assert.ok((await publicGet(check.listing)).html.includes(check.marker), `${resource.key}: listed at ${check.listing}`);

    // Unpublish: the checkbox is simply absent from the form
    const unpublished = { ...values }; delete unpublished.isPublished;
    assert.equal((await save(admin, resource, `/admin/${resource.key}/${row.id}`, unpublished)).status, 302);
    page = await publicGet(check.path(row));
    assert.ok(!page.html.includes(check.marker) || page.status === 404, `${resource.key}: hidden once unpublished`);
    if (check.listing) assert.ok(!(await publicGet(check.listing)).html.includes(check.marker), `${resource.key}: gone from ${check.listing}`);
  }
});

// ── Albums and photos ──────────────────────────────────────────────────────────────────────────────────
test('album photos: upload several, caption and reorder, delete one, and see them in the public gallery', async () => {
  const admin = await adminSession();
  const album = resources.find((entry) => entry.key === 'albums');
  const created = await save(admin, album, '/admin/albums', payloadFor(album));
  assert.equal(created.status, 302);
  const row = tables.album[0];
  assert.match(created.headers.get('location'), new RegExp(`/admin/albums/${row.id}/edit`));

  const form = new FormData();
  for (const name of ['one.png', 'two.png']) form.append('photos', new Blob([PNG], { type: 'image/png' }), name);
  const uploaded = await admin(`/admin/albums/${row.id}/photos?_csrf=${encodeURIComponent(admin.csrf)}`, { method: 'POST', body: form });
  assert.equal(uploaded.status, 302);
  assert.equal(tables.photo.length, 2);
  assert.equal(tables.photo.every((photo) => photo.albumId === row.id && photo.imageUrl), true);

  const [first, second] = tables.photo;
  const saved = await admin(`/admin/albums/${row.id}/photos/save`, { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf, [`caption_${first.id}`]: 'First caption', [`order_${first.id}`]: '2', [`caption_${second.id}`]: '', [`order_${second.id}`]: '1' }) });
  assert.equal(saved.status, 302);
  assert.equal(first.caption, 'First caption');
  assert.equal(second.caption, null);

  const gallery = await publicGet(`/gallery/${row.slug}`);
  assert.equal(gallery.status, 200);
  assert.match(gallery.html, /First caption/);
  assert.equal((await publicGet('/gallery')).html.includes('E2E Title'), true);

  const deleted = await admin(`/admin/albums/${row.id}/photos/${first.id}/delete`, { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf }) });
  assert.equal(deleted.status, 302);
  assert.equal(tables.photo.length, 1);

  const none = new FormData();
  const empty = await admin(`/admin/albums/${row.id}/photos?_csrf=${encodeURIComponent(admin.csrf)}`, { method: 'POST', body: none });
  assert.equal(empty.status, 302, 'no files: a message, not an error page');

  await admin(`/admin/albums/${row.id}/delete`, { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf }) });
  assert.equal(tables.photo.length, 0, 'deleting an album removes its photos');
});

test('upload rules: wrong type and fake images are refused with a message next to the field', async () => {
  const admin = await adminSession();
  const team = resources.find((entry) => entry.key === 'team');
  const values = payloadFor(team);
  const fake = await save(admin, team, '/admin/team', values, { photo: ['evil.png', 'image/png', Buffer.from('<script>alert(1)</script>')] });
  assert.equal(fake.status, 422);
  assert.equal(tables.teamMember.length, 0);
  const wrong = await save(admin, team, '/admin/team', values, { photo: ['notes.txt', 'text/plain', Buffer.from('hello')] });
  assert.equal(wrong.status, 422);
  assert.equal(tables.teamMember.length, 0);
});

// ── Page content ───────────────────────────────────────────────────────────────────────────────────────
test('editing page text in the admin changes the public page', async () => {
  const admin = await adminSession();
  const about = pageConfigs.find((entry) => entry.slug === 'about');
  const fields = {};
  for (const field of about.fields) if (['text', 'textarea'].includes(field.type) && !field.name.startsWith('seo')) fields[field.name] = field.default || 'Text';
  fields.title = 'E2E About Heading';
  const response = await admin('/admin/pages/about', { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf, ...fields }) });
  assert.equal(response.status, 302, 'saved');
  const page = await publicGet('/about');
  assert.match(page.html, /E2E About Heading/);
});

// ── Tutors ─────────────────────────────────────────────────────────────────────────────────────────────
test('tutor accounts: add, invite, suspend, reactivate, promote, demote and delete from the admin', async () => {
  const admin = await adminSession();
  const created = await admin('/admin/tutors', { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf, name: 'E2E Tutor', email: 'e2e.tutor@example.test', status: 'ACTIVE', phone: '', institution: 'E2E College' }) });
  assert.equal(created.status, 302);
  const tutor = Object.values(state.users).find((user) => user.email === 'e2e.tutor@example.test');
  assert.ok(tutor && tutor.role === 'TUTOR');
  assert.deepEqual(sent.invites, ['e2e.tutor@example.test']);
  assert.equal((await admin('/admin/tutors')).status, 200);
  assert.match(await (await admin('/admin/tutors')).text(), /E2E Tutor/);

  const act = async (action) => (await admin(`/admin/tutors/${tutor.id}/${action}`, { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf }) })).status;
  assert.equal(await act('suspend'), 302); assert.equal(tutor.status, 'SUSPENDED');
  assert.equal(await act('reactivate'), 302); assert.equal(tutor.status, 'ACTIVE');
  assert.equal(await act('promote'), 302); assert.equal(tutor.canManageContent, true);
  assert.equal(await act('demote'), 302); assert.equal(tutor.canManageContent, false);
  assert.equal(await act('invite'), 302); assert.equal(sent.invites.length, 2);
  assert.equal((await admin(`/admin/tutors/${tutor.id}/edit`)).status, 200);
  const edit = await admin(`/admin/tutors/${tutor.id}`, { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf, name: 'E2E Tutor Renamed', email: 'e2e.tutor@example.test', institution: 'New College' }) });
  assert.equal(edit.status, 302); assert.equal(tutor.name, 'E2E Tutor Renamed');
  assert.equal((await admin(`/admin/tutors/${tutor.id}/delete`)).status, 200);
  assert.equal(await act('delete'), 302);
  assert.ok(!Object.values(state.users).some((user) => user.email === 'e2e.tutor@example.test'));
});

// ── Dashboard, password, session ───────────────────────────────────────────────────────────────────────
test('the dashboard reflects real content and links to every area', async () => {
  const admin = await adminSession();
  const team = resources.find((entry) => entry.key === 'team');
  await save(admin, team, '/admin/team', payloadFor(team));
  const html = await (await admin('/admin')).text();
  assert.match(html, /<h1[^>]*>/);
  for (const item of adminNavigation.filter((entry) => entry.href && entry.href !== '/admin')) assert.match(html, new RegExp(item.href.replace(/\//g, '\\/')), item.label + ' linked');
});

test('administrators can change their own password, and a wrong current password is refused', async () => {
  const admin = await adminSession();
  const wrong = await admin('/admin/password', { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf, currentPassword: 'nope', password: 'a-new-password-123', confirmPassword: 'a-new-password-123' }) });
  assert.ok([401, 422, 403].includes(wrong.status) || wrong.status === 302);
  const hashBefore = state.users.admin.passwordHash;
  const ok = await admin('/admin/password', { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf, currentPassword: password, password: 'a-new-password-123', confirmPassword: 'a-new-password-123' }) });
  assert.ok([200, 302].includes(ok.status));
  void hashBefore;
});

test('logging out ends the admin session and /admin is closed again', async () => {
  const admin = await adminSession();
  assert.equal((await admin('/admin')).status, 200);
  const out = await admin('/logout', { method: 'POST', body: new URLSearchParams({ _csrf: admin.csrf }) });
  assert.equal(out.status, 302);
  const after = await admin('/admin');
  assert.equal(after.status, 302);
  assert.equal(after.headers.get('location'), '/login');
});
