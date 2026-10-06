const test = require('node:test');
const assert = require('node:assert/strict');
const { createFixture, state, reset, announcement, content } = require('./fixtures/publicNotifications');
const service = require('../src/services/notifications');
let server, base;
test.before(async () => {
  server = createFixture().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { reset(); content.clearCache(); });

test('the public feed excludes tutor-only, draft and future announcements without creating sessions', async () => {
  const response = await fetch(base + '/api/public/notifications');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  const data = await response.json();
  assert.equal(data.total, 2); assert.equal(data.unreadCount, 2);
  assert.deepEqual(data.items.map((item) => item.id).sort(), ['notice-one', 'notice-two']);
  assert(data.items.every((item) => !('authorId' in item) && !('audience' in item)));
});

test('reading all clears the count; a newly published or edited backdated notice becomes new again', async () => {
  const first = await (await fetch(base + '/api/public/notifications')).json();
  assert.equal((await service.getPublicNotifications({ since: new Date(first.asOf) })).unreadCount, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const created = announcement('new-notice', { updatedAt: new Date(), publishedAt: new Date('2025-01-01T00:00:00.000Z') });
  state.announcements.push(created); content.clearCache();
  const updated = await service.getPublicNotifications({ since: new Date(first.asOf) });
  assert.equal(updated.unreadCount, 1);
  assert.equal(updated.items[0].id, 'new-notice');
  assert(updated.items[0].versionAt > first.asOf);
  const readAt = new Date(updated.asOf);
  await new Promise((resolve) => setTimeout(resolve, 10));
  state.announcements[0].updatedAt = new Date(); content.clearCache();
  assert.equal((await service.getPublicNotifications({ since: readAt })).unreadCount, 1);
});

test('counts cover every published notice while the panel and full page stay paginated', async () => {
  state.announcements = Array.from({length: 25}, (_, index) => announcement('item-' + index)); content.clearCache();
  const first = await service.getPublicNotifications();
  assert.equal(first.total, 25); assert.equal(first.unreadCount, 25); assert.equal(first.items.length, 20); assert.equal(first.hasMore, true);
  const second = await service.getPublicNotifications({page: 2});
  assert.equal(second.items.length, 5); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 25);
  const page = await (await fetch(base + '/announcements?page=2')).text();
  assert(page.includes('Previous page')); assert(!page.includes('Next page'));
});

test('zero notices still render an accessible bell and a usable empty announcements page', async () => {
  state.announcements = []; content.clearCache();
  const home = await (await fetch(base + '/')).text();
  assert.equal((home.match(/data-notification-trigger/g) || []).length, 2);
  assert(home.includes('aria-label="Notifications: 0 new"'));
  assert(home.includes('No notifications yet'));
  const response = await fetch(base + '/announcements');
  assert.equal(response.status, 200); assert((await response.text()).includes('No announcements yet'));
});

test('invalid cursors are rejected and future read dates are clamped', async () => {
  for (const query of ['page=-1', 'page=99999999', 'since=invalid', 'since=2026-02-30T00%3A00%3A00.000Z', 'since=a&since=b']) {
    assert.equal((await fetch(base + '/api/public/notifications?' + query)).status, 400, query);
  }
  const parsed = service.parseQuery({since: '2099-01-01T00:00:00.000Z'});
  assert(parsed.since <= new Date());
});

test('concurrent navbar requests share one database read and refresh after an admin change', async () => {
  const feeds = await Promise.all(Array.from({length: 12}, () => service.getPublicNotifications()));
  assert(feeds.every((feed) => feed.total === 2)); assert.equal(state.reads, 1);
  state.announcements.push(announcement('admin-published'));
  content.clearCache();
  assert.equal((await service.getPublicNotifications()).total, 3);
  assert.equal(state.reads, 2);
});

test('a notification outage preserves public pages and a failed read is retried', async (context) => {
  context.mock.method(console, 'error', () => {});
  state.failCounts = true;
  assert.equal((await fetch(base + '/api/public/notifications')).status, 503);
  const page = await fetch(base + '/about');
  assert.equal(page.status, 200);
  assert((await page.text()).includes('Notifications: temporarily unavailable'));
  state.failCounts = false;
  const response = await fetch(base + '/api/public/notifications');
  assert.equal(response.status, 200); assert.equal((await response.json()).total, 2);
});

test('untrusted announcement markup is escaped in the homepage, panel and announcements page', async () => {
  state.announcements = [announcement('escaped', {title: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>'})]; content.clearCache();
  for (const path of ['/', '/announcements']) {
    const html = await (await fetch(base + path)).text();
    assert(!html.includes('<img src=x onerror=alert(1)>'));
    assert(!html.includes('<script>alert(1)</script>'));
    assert(html.includes('&lt;img'));
  }
});
