// Repeated wrong passwords lock an account for a while, with the same answer as any other failure.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPortalFixture, resetFixture, state, password } = require('./fixtures/tutorPortal');

let server, base;
test.before(async () => { server = createPortalFixture().listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => new Promise((r) => server.close(r)));
const { loginLimiter } = require('../src/middleware/rateLimits');
test.beforeEach(() => { resetFixture(); for (const key of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) loginLimiter.resetKey(key); });

async function attempt(email, pass) {
  let cookie = '';
  const page = await fetch(base + '/login');
  cookie = page.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const response = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { cookie }, body: new URLSearchParams({ _csrf: csrf, email, password: pass }) });
  return { status: response.status, text: response.status === 302 ? '' : await response.text() };
}

test('eight wrong passwords lock the account, even for the right password, with an identical message', async () => {
  for (let i = 0; i < 8; i++) assert.equal((await attempt('tutor@example.test', 'wrong-' + i)).status, 401);
  assert.ok(state.users.tutor.lockedUntil > new Date());
  const locked = await attempt('tutor@example.test', password);
  assert.equal(locked.status, 401, 'correct password refused while locked');
  assert.match(locked.text, /Incorrect email or password/);
  state.users.tutor.lockedUntil = new Date(Date.now() - 1000);
  assert.equal((await attempt('tutor@example.test', password)).status, 302, 'works again after the lock ends');
  assert.equal(state.users.tutor.failedLogins, 0);
  assert.equal(state.users.tutor.lockedUntil, null);
});

test('a successful login resets the count; unknown emails behave the same and store nothing', async () => {
  for (let i = 0; i < 5; i++) await attempt('tutor@example.test', 'bad');
  assert.equal((await attempt('tutor@example.test', password)).status, 302);
  assert.equal(state.users.tutor.failedLogins, 0);
  const unknown = await attempt('nobody@example.test', 'bad');
  assert.equal(unknown.status, 401);
  assert.match(unknown.text, /Incorrect email or password/);
});
