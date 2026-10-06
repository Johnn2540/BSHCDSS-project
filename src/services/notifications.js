// Public notifications use the existing announcements managed by admins.
// Read status belongs to the visitor's browser; no account or session is required.
const { prisma } = require('../lib/db');

const PAGE_SIZE = 20;
const CACHE_MS = 30000;
let firstPageCache = null;
let firstPageLoad = null;

function clearCache() {
  firstPageCache = null;
  firstPageLoad = null;
}

function publishedWhere(asOf) {
  return { audience: 'PUBLIC', isPublished: true, publishedAt: { lte: asOf }, updatedAt: { lte: asOf } };
}

async function loadPage(page) {
  const asOf = new Date();
  const where = publishedWhere(asOf);
  const [rows, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, title: true, body: true, publishedAt: true, updatedAt: true },
    }),
    prisma.announcement.count({ where }),
  ], { isolationLevel: 'RepeatableRead', maxWait: 10000, timeout: 15000 });
  return {
    items: rows.map((row) => ({
      id: row.id, title: row.title, body: row.body,
      publishedAt: row.publishedAt.toISOString(),
      versionAt: new Date(Math.max(row.publishedAt.getTime(), row.updatedAt.getTime())).toISOString(),
    })),
    total, page, pageSize: PAGE_SIZE, asOf: asOf.toISOString(), hasMore: page * PAGE_SIZE < total,
  };
}

async function getPublicNotifications({ since = null, page = 1 } = {}) {
  let feed;
  if (page === 1 && firstPageCache && firstPageCache.expires > Date.now()) {
    feed = firstPageCache.value;
  } else if (page === 1) {
    // Share a cold read across concurrent page requests instead of occupying
    // several connections from a serverless instance's small database pool.
    if (!firstPageLoad) {
      const request = loadPage(1).then((value) => {
        if (firstPageLoad === request) firstPageCache = { value, expires: Date.now() + CACHE_MS };
        return value;
      }).finally(() => { if (firstPageLoad === request) firstPageLoad = null; });
      firstPageLoad = request;
    }
    feed = await firstPageLoad;
  } else {
    feed = await loadPage(page);
  }
  const asOf = new Date(feed.asOf);
  const unreadCount = !since ? feed.total : since >= asOf ? 0 : await prisma.announcement.count({
    where: {
      ...publishedWhere(asOf),
      OR: [{ updatedAt: { gt: since } }, { publishedAt: { gt: since } }],
    },
  });
  return { ...feed, unreadCount };
}

function parseQuery(query) {
  const pageText = query.page ?? '1';
  if (typeof pageText !== 'string' || !/^[1-9]\d{0,3}$/.test(pageText)) throw new Error('Invalid page');
  let since = null;
  if (query.since !== undefined) {
    if (typeof query.since !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(query.since)) throw new Error('Invalid read date');
    since = new Date(query.since);
    if (!Number.isFinite(since.getTime()) || since.toISOString() !== query.since) throw new Error('Invalid read date');
    // A browser's clock must not suppress notices published later by the server.
    if (since > new Date()) since = new Date();
  }
  return { page: Number(pageText), since };
}

module.exports = { getPublicNotifications, clearCache, parseQuery, publishedWhere, PAGE_SIZE };
