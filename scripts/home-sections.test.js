const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { create } = require('express-handlebars');

// The controller pulls in the content service and mailer; no database or SMTP is needed to test pure shaping.
const dbPath = require.resolve('../src/lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: {}, pool: {} } };
const { buildMediaTiles, noticeCards } = require('../src/controllers/publicController');
const helpers = require('../src/helpers/handlebars');

const album = (n) => ({ title: `Album ${n}`, slug: `album-${n}`, date: null, coverUrl: `https://res.cloudinary.com/demo/image/upload/v1/a${n}.jpg`, photoCount: n });
const video = (n, extra = {}) => ({ title: `Video ${n}`, thumbnailUrl: `https://res.cloudinary.com/demo/video/upload/so_1/v${n}.jpg`, date: null, durationLabel: '0:40', isPortrait: false, ...extra });
const kinds = (tiles) => tiles.map((t) => (t.isVideo ? 'video' : 'album')).join(',');

test('gallery tiles: a published video always gets a place, never more than three tiles', () => {
  assert.equal(kinds(buildMediaTiles([album(1)], [video(1)])), 'album,video');
  assert.equal(kinds(buildMediaTiles([album(1), album(2), album(3)], [])), 'album,album,album');
  assert.equal(kinds(buildMediaTiles([album(1), album(2), album(3)], [video(1), video(2)])), 'album,album,video');
  assert.equal(kinds(buildMediaTiles([], [video(1), video(2), video(3), video(4)])), 'video,video,video');
  assert.equal(kinds(buildMediaTiles([album(1)], [])), 'album');
  assert.deepEqual(buildMediaTiles([], []), []);
});

test('gallery tiles: albums link to their page and videos to the gallery videos section', () => {
  const [a, v] = buildMediaTiles([album(2)], [video(1, { isPortrait: true })]);
  assert.equal(a.href, '/gallery/album-2');
  assert.equal(a.photoCount, 2);
  assert.equal(v.href, '/gallery#videos');
  assert.equal(v.isPortrait, true);
  assert.equal(v.durationLabel, '0:40');
});

test('announcements: recent notices are flagged New, older ones are not', () => {
  const day = 24 * 60 * 60 * 1000;
  const [fresh, edge, old] = noticeCards([
    { id: '1', title: 'a', body: 'x', publishedAt: new Date(Date.now() - 2 * day) },
    { id: '2', title: 'b', body: 'x', publishedAt: new Date(Date.now() - 13 * day) },
    { id: '3', title: 'c', body: 'x', publishedAt: new Date(Date.now() - 15 * day) },
  ]);
  assert.equal(fresh.isNew, true);
  assert.equal(edge.isNew, true);
  assert.equal(old.isNew, false);
});

test('announcements: teaser is the first paragraph; the full-notice link only appears when something is hidden', () => {
  const published = new Date();
  const [many, longOne, short, empty] = noticeCards([
    { id: '1', title: 't', body: 'First paragraph.\n\nSecond paragraph.\r\n\r\nThird.', publishedAt: published },
    { id: '2', title: 't', body: 'x'.repeat(241), publishedAt: published },
    { id: '3', title: 't', body: 'Just one short paragraph.', publishedAt: published },
    { id: '4', title: 't', body: '', publishedAt: published },
  ]);
  assert.equal(many.teaser, 'First paragraph.');
  assert.equal(many.hasMore, true);
  assert.equal(longOne.hasMore, true);
  assert.equal(short.teaser, 'Just one short paragraph.');
  assert.equal(short.hasMore, false);
  assert.equal(empty.teaser, '');
  assert.equal(empty.hasMore, false);
});

test('announcements: only notices over 900 characters count as long', () => {
  const [ok, long] = noticeCards([
    { id: '1', title: 't', body: 'x'.repeat(900), publishedAt: new Date() },
    { id: '2', title: 't', body: 'x'.repeat(901), publishedAt: new Date() },
  ]);
  assert.equal(ok.isLong, false);
  assert.equal(long.isLong, true);
});

async function renderTiles(tiles) {
  const hbs = create({ extname: '.hbs', partialsDir: path.join(__dirname, '..', 'src', 'views', 'partials'), helpers });
  const partials = await hbs.getPartials();
  const template = hbs.handlebars.compile('{{> media-tiles tiles=tiles feature=(eq tiles.length 1)}}');
  return template({ tiles }, { helpers, partials });
}

test('tile markup: one tile is a feature row, two share the row, three fill it', async () => {
  const one = await renderTiles(buildMediaTiles([album(1)], []));
  assert.match(one, /lg:flex-row/);
  assert.doesNotMatch(one, /md:grid-cols-2/);

  const two = await renderTiles(buildMediaTiles([album(1)], [video(1)]));
  assert.match(two, /md:grid-cols-2/);
  assert.doesNotMatch(two, /lg:grid-cols-3/);
  assert.doesNotMatch(two, /lg:flex-row/);

  const three = await renderTiles(buildMediaTiles([album(1), album(2), album(3)], []));
  assert.match(three, /lg:grid-cols-3/);
});

test('tile markup: badge, call to action and portrait handling per tile type', async () => {
  const html = await renderTiles(buildMediaTiles([album(1)], [video(1, { isPortrait: true })]));
  assert.match(html, /Photo album/);
  assert.match(html, /View album/);
  assert.match(html, /1 photo(?!s)/);
  assert.match(html, />\s*Video\s*</);
  assert.match(html, /Watch video/);
  assert.match(html, /href="\/gallery#videos"/);
  assert.match(html, /object-contain/, 'portrait video poster keeps its whole frame');
  assert.match(html, /object-cover/, 'album cover fills its tile');
  assert.match(html, /Duration: <\/span>0:40/);
  assert.equal((html.match(/alt=""/g) || []).length, 2, 'photos are decorative: the heading names the link');
});

test('tile markup: a tile without a picture keeps a branded placeholder instead of a broken image', async () => {
  const html = await renderTiles(buildMediaTiles([{ ...album(1), coverUrl: null }], []));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /hero-pattern/);
});
