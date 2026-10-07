// Exercise real routes, login sessions, CSRF and views with isolated persistence.
// These tests never alter production accounts, send emails or upload real files.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPortalFixture, resetFixture, state, password } = require('./fixtures/tutorPortal');
const { permissionsFor } = require('../src/services/permissions');
const tutors = require('../src/controllers/admin/tutorsController');
let server, base;

test.before(async () => {
  server = createPortalFixture().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(resetFixture);

function client() {
  let cookie = '';
  return async (path, options = {}) => {
    const response = await fetch(base + path, {
      ...options, redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { ...options.headers, ...(cookie ? { cookie } : {}) },
    });
    const value = response.headers.get('set-cookie');
    if (value) cookie = value.split(';')[0];
    return response;
  };
}
function token(html) {
  const value = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
  assert(value, 'The rendered form includes a CSRF token');
  return value;
}
async function login(key, returnTo) {
  const request = client();
  if (returnTo) assert.equal((await request(returnTo)).headers.get('location'), '/login');
  const html = await (await request('/login')).text();
  const response = await request('/login', {
    method: 'POST', body: new URLSearchParams({ _csrf: token(html), email: key + '@example.test', password }),
  });
  return { request, response };
}
async function post(request, path, csrf, fields = {}) {
  return request(path, { method: 'POST', body: new URLSearchParams({ _csrf: csrf, ...fields }) });
}

test('administration permissions deny inactive users, unknown roles and forged flag values', () => {
  assert.deepEqual(permissionsFor(state.users.admin), { manageAccounts: true, manageContent: true });
  assert.deepEqual(permissionsFor(state.users.delegated), { manageAccounts: false, manageContent: true });
  for (const user of [null, state.users.tutor, { ...state.users.tutor, canManageContent: 'true' },
    { ...state.users.delegated, status: 'PENDING' }, { ...state.users.delegated, status: 'SUSPENDED' },
    { ...state.users.admin, status: 'SUSPENDED' }, { ...state.users.delegated, role: 'UNKNOWN' }]) {
    assert.deepEqual(permissionsFor(user), { manageAccounts: false, manageContent: false });
  }
});

test('administrators can promote an active tutor without changing their role or other account fields', async () => {
  const { request: tutor } = await login('tutor');
  assert.equal((await tutor('/admin')).status, 403);
  const { request: admin } = await login('admin');
  const html = await (await admin('/admin/tutors')).text();
  assert.match(html, /action="\/admin\/tutors\/tutor\/promote"/);
  assert.doesNotMatch(html, /action="\/admin\/tutors\/pending\/promote"/);
  const original = { ...state.users.tutor };
  const response = await post(admin, '/admin/tutors/tutor/promote', token(html), {
    role: 'ADMIN', status: 'SUSPENDED', email: 'forged@example.test', canManageContent: 'false',
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/tutors');
  assert.deepEqual(state.users.tutor, { ...original, canManageContent: true });
  assert.equal((await tutor('/admin')).status, 200, 'The existing session gains delegated content access');
  assert.equal((await tutor('/login')).headers.get('location'), '/admin');
  const list = await (await admin('/admin/tutors')).text();
  assert.match(list, /Content administrator/);
  assert.match(list, /action="\/admin\/tutors\/tutor\/demote"/);
});

test('promoted tutors can manage all content areas and download drafts without seeing account management', async () => {
  const { request, response } = await login('delegated');
  assert.equal(response.headers.get('location'), '/admin');
  const dashboard = await request('/admin');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers.get('cache-control'), 'private, no-store');
  const html = await dashboard.text();
  assert.match(html, /Content administrator/);
  assert.doesNotMatch(html, /\/admin\/tutors|pending@example\.test|Tutor accounts|awaiting approval/);
  assert.equal(state.accountManagementReads, 0, 'The delegated dashboard never queries tutor account data');
  for (const route of ['/admin/pages', '/admin/pages/site/edit', '/admin/team', '/admin/activities',
    '/admin/documents', '/admin/reports', '/admin/plans', '/admin/announcements', '/admin/partners',
    '/admin/albums', '/admin/videos', '/admin/password', '/tutor', '/tutor/reports']) {
    assert.equal((await request(route)).status, 200, route);
  }
  assert.equal((await request('/documents/draft/download')).status, 302);
  const edit = await (await request('/admin/reports/report/edit')).text();
  const updated = await post(request, '/admin/reports/report', token(edit), {
    title: 'Delegated content update', category: 'Training', portalSection: 'REPORTS', audience: 'TUTORS', isPublished: 'on',
  });
  assert.equal(updated.status, 302);
  assert.equal(state.documents.find(row => row.id === 'report').title, 'Delegated content update');
  assert.equal(state.users.delegated.role, 'TUTOR');
});

test('promoted tutors cannot read, create, edit, delete or change access for any account through direct requests', async () => {
  const { request } = await login('delegated');
  const csrf = token(await (await request('/admin/password')).text());
  const before = structuredClone(state.users);
  const writeCount = state.userWrites.length;
  for (const path of ['/admin/tutors', '/admin/tutors/new', '/admin/tutors/admin/edit',
    '/admin/tutors/tutor/delete', '/admin/tutors/delegated/edit', '/ADMIN/TUTORS/delegated-peer/edit']) {
    assert.equal((await request(path)).status, 403, path);
  }
  const fields = { name: 'Forged account', email: 'forged@example.test', role: 'ADMIN', status: 'ACTIVE', canManageContent: 'true' };
  assert.equal((await post(request, '/admin/tutors', csrf, fields)).status, 403);
  for (const target of ['admin', 'tutor', 'delegated', 'delegated-peer']) {
    for (const action of ['', '/approve', '/suspend', '/reactivate', '/invite', '/delete', '/promote', '/demote']) {
      const path = '/admin/tutors/' + target + action;
      assert.equal((await post(request, path, csrf, fields)).status, 403, path);
    }
  }
  assert.equal((await post(request, '/ADMIN/TUTORS/tutor/PrOmOtE', csrf, fields)).status, 403);
  assert.deepEqual(state.users, before);
  assert.equal(state.userWrites.length, writeCount);
  assert.equal(state.accountManagementReads, 0);
  await assert.rejects(tutors.promote({ user: state.users.delegated, params: { id: 'tutor' } }, {}), { status: 403 });
});

test('revoking administration access takes effect on the next request in the existing session', async () => {
  const { request: delegated } = await login('delegated');
  const staleCsrf = token(await (await delegated('/admin/reports/report/edit')).text());
  const { request: admin } = await login('admin');
  const csrf = token(await (await admin('/admin/tutors')).text());
  assert.equal((await post(admin, '/admin/tutors/delegated/demote', csrf)).status, 302);
  assert.equal(state.users.delegated.role, 'TUTOR');
  assert.equal(state.users.delegated.canManageContent, false);
  assert.equal((await delegated('/admin')).status, 403);
  assert.equal((await post(delegated, '/admin/reports/report', staleCsrf, {
    title: 'Stale privileged form', category: 'Training', portalSection: 'REPORTS', audience: 'TUTORS',
  })).status, 403);
  assert.equal(state.documents.find(row => row.id === 'report').title, 'Training progress report');
  assert.equal((await delegated('/documents/draft/download')).status, 404);
  assert.equal((await delegated('/tutor')).status, 200);
  assert.equal((await delegated('/login')).headers.get('location'), '/tutor');
});

test('promotion and demotion require POST, CSRF, an administrator actor and a tutor target', async () => {
  const { request: admin } = await login('admin');
  const csrf = token(await (await admin('/admin/tutors')).text());
  const before = structuredClone(state.users);
  for (const path of ['/admin/tutors/tutor/promote', '/admin/tutors/delegated/demote']) {
    assert.equal((await admin(path)).status, 404);
    assert.equal((await admin(path, { method: 'POST', body: new URLSearchParams() })).status, 403);
  }
  for (const action of ['promote', 'demote']) {
    assert.equal((await post(admin, '/admin/tutors/admin/' + action, csrf)).status, 404);
    assert.equal((await post(admin, '/admin/tutors/missing/' + action, csrf)).status, 404);
  }
  for (const key of ['pending', 'suspended']) assert.equal((await post(admin, '/admin/tutors/' + key + '/promote', csrf)).status, 409);
  assert.deepEqual(state.users, before);
  const { request: tutor } = await login('tutor');
  const tutorCsrf = token(await (await tutor('/tutor/password')).text());
  assert.equal((await post(tutor, '/admin/tutors/tutor/promote', tutorCsrf)).status, 403);
  assert.equal((await client()('/admin/tutors/tutor/promote')).headers.get('location'), '/login');
});

test('promotion rechecks the target role and status at the database write', async () => {
  const { request: admin } = await login('admin');
  const csrf = token(await (await admin('/admin/tutors')).text());
  const count = state.userWrites.length;
  state.beforeUserUpdate = () => { state.users.tutor.status = 'SUSPENDED'; };
  assert.equal((await post(admin, '/admin/tutors/tutor/promote', csrf)).status, 409);
  assert.equal(state.users.tutor.canManageContent, false);
  state.users.tutor.status = 'ACTIVE';
  state.beforeUserUpdate = () => { state.users.tutor.role = 'ADMIN'; };
  assert.equal((await post(admin, '/admin/tutors/tutor/promote', csrf)).status, 409);
  assert.equal(state.users.tutor.canManageContent, false);
  assert.equal(state.userWrites.length, count);
});

test('login destinations respect delegated access and do not return a promoted tutor to account management', async () => {
  for (const [key, path, expected] of [
    ['delegated', '/admin/reports', '/admin/reports'],
    ['delegated', '/ADMIN/TUTORS/tutor/edit', '/admin'],
    ['tutor', '/admin/reports', '/tutor'],
    ['admin', '/admin/tutors', '/admin/tutors'],
  ]) {
    assert.equal((await login(key, path)).response.headers.get('location'), expected);
  }
});

test('a suspended promoted tutor loses both administration and tutor access in an existing session', async () => {
  const { request } = await login('delegated');
  state.users.delegated.status = 'SUSPENDED';
  assert.equal((await request('/admin')).headers.get('location'), '/login');
  assert.equal((await request('/tutor')).headers.get('location'), '/login');
  const response = (await login('delegated')).response;
  assert.equal(response.status, 403);
});
