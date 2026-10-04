const test = require('node:test');
const assert = require('node:assert/strict');

const albums = [{ id: 'album', title: 'Workshop', slug: 'workshop', photos: [], _count: { photos: 0 } }];
let videoCount = 1;
let countFailure = null;
let albumReads = 0;
let countReads = 0;
const dbPath = require.resolve('../src/lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: {
  pageContent: { findUnique: async () => null },
  activity: { findMany: async () => [] },
  announcement: { findMany: async () => [] },
  album: { findMany: async (query) => {
    albumReads++;
    assert.equal(query.take, 3);
    assert.deepEqual(query.where, { isPublished: true });
    assert.deepEqual(query.orderBy, [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]);
    return albums;
  } },
  video: {
    count: async (query) => {
      countReads++;
      assert.deepEqual(query.where, { isPublished: true });
      if (countFailure) throw countFailure;
      return videoCount;
    },
    // Reproduce the old deployed client's inability to decode CLOUDINARY. Home
    // must render without fetching or decoding any video records.
    findMany: async () => { throw new Error("Value 'CLOUDINARY' not found in enum 'VideoProvider'"); },
  },
} } };
const content = require('../src/services/content');
test.beforeEach(() => { content.clearCache(); videoCount = 1; countFailure = null; albumReads = 0; countReads = 0; });

test('home returns published media previews without decoding video-provider records', async () => {
  const home = await content.getHomePage();
  assert.equal(home.videoCount, 1);
  assert.deepEqual(home.albums, albums);
  assert.ok(home.page.title);
  assert.ok(home.curriculum.title);
});

test('empty galleries report zero videos and media counts refresh after admin cache invalidation', async () => {
  videoCount = 0;
  assert.equal((await content.getHomePage()).videoCount, 0);
  videoCount = 2;
  assert.equal((await content.getHomePage()).videoCount, 0);
  assert.equal(countReads, 1);
  assert.equal(albumReads, 1);
  content.clearCache();
  assert.equal((await content.getHomePage()).videoCount, 2);
  assert.equal(countReads, 2);
});

test('database failures propagate and a failed media query is retried, not cached', async () => {
  countFailure = new Error('Database unavailable');
  await assert.rejects(content.getHomePage(), /Database unavailable/);
  countFailure = null;
  assert.equal((await content.getHomePage()).videoCount, 1);
  assert.equal(countReads, 2);
});
