// Content service: the single place public views get their content from.
// Reads from the database; page text falls back to defaults in src/config/pages.js
// until an admin saves that page. Results are cached briefly and the cache is
// cleared whenever an admin changes something (see clearCache).

const fs = require('fs');
const path = require('path');
const { prisma } = require('../lib/db');
const pageConfigs = require('../config/pages');

// On Vercel several function instances run at once and each has its own cache; an admin save
// only clears the instance that handled it, so others could show old content until expiry.
// A short TTL there keeps edits visible within ~30 seconds.
const CACHE_TTL_MS = process.env.VERCEL ? 30 * 1000 : 5 * 60 * 1000;
const cache = new Map();

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  // Misses (e.g. unknown slugs) aren't cached, so random URLs can't grow the cache.
  if (value != null) cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

function clearCache() {
  cache.clear();
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
// Brand assets in public/images/brand/, generated from logo-original.jpg:
//   logo-lockup-*   full horizontal logo (seal + wordmark + flag + tagline) on its black background
//   logo-emblem-*   the seal alone, cut out as a transparent circle
// If they're missing, the placeholder emblem is used and the header falls back to text.

const BRAND_DIR = path.join(__dirname, '..', '..', 'public', 'images', 'brand');
const hasBrand = fs.existsSync(path.join(BRAND_DIR, 'logo-lockup-1280.webp'));
const B = '/images/brand';

const brand = hasBrand
  ? {
      lockup: {
        webp640: `${B}/logo-lockup-640.webp`,
        webp1280: `${B}/logo-lockup-1280.webp`,
        jpg: `${B}/logo-lockup-1280.jpg`,
        width: 1280,
        height: 477,
      },
      emblem: { webp128: `${B}/logo-emblem-128.webp`, webp256: `${B}/logo-emblem-256.webp`, webp512: `${B}/logo-emblem-512.webp`, png256: `${B}/logo-emblem-256.png` },
      favicon32: `${B}/favicon-32.png`,
      favicon48: `${B}/favicon-48.png`,
      appleTouchIcon: `${B}/apple-touch-icon.png`,
      ogImage: `${B}/og-image.jpg`,
    }
  : null;
const logoUrl = brand ? brand.emblem.webp256 : '/images/logo-placeholder.svg';

// ─── Pages ────────────────────────────────────────────────────────────────────

const COLUMN_FIELDS = ['title', 'summary', 'body'];

function getPageConfig(slug) {
  return pageConfigs.find((p) => p.slug === slug) || null;
}

// Flat object of field values: saved values where present, defaults otherwise.
function rowToValues(config, row) {
  const sections = (row && row.sections) || {};
  const values = {};
  for (const field of config.fields) {
    const saved = COLUMN_FIELDS.includes(field.name) ? row && row[field.name] : sections[field.name];
    values[field.name] = row ? saved ?? (field.type === 'lines' ? [] : '') : field.default ?? '';
  }
  return values;
}

function valuesToRow(config, values) {
  const row = { title: '', summary: null, body: null, sections: {} };
  for (const field of config.fields) {
    const value = values[field.name];
    if (COLUMN_FIELDS.includes(field.name)) row[field.name] = value === '' ? null : value;
    else row.sections[field.name] = value;
  }
  row.title = row.title || config.label;
  return row;
}

async function getPage(slug) {
  return cached(`page:${slug}`, async () => {
    const config = getPageConfig(slug);
    if (!config) throw new Error(`Unknown page: ${slug}`);
    const row = await prisma.pageContent.findUnique({ where: { slug } });
    return rowToValues(config, row);
  });
}

// ─── Site-wide data ───────────────────────────────────────────────────────────

async function getSite() {
  const page = await getPage('site');
  return {
    shortName: page.title,
    fullName: page.fullName,
    ministry: page.ministry,
    country: page.country,
    tagline: page.summary,
    contact: { address: page.address || [], phone: page.phone, email: page.email, hours: page.hours },
    logoUrl,
    brand,
  };
}

async function getPartners() {
  return cached('partners', () =>
    prisma.partner.findMany({
      where: { isPublished: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    })
  );
}

async function getActivities() {
  return cached('activities', () =>
    prisma.activity.findMany({
      where: { isPublished: true },
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      select: { id: true, slug: true, title: true, summary: true, coverImageUrl: true, externalUrl: true },
    })
  );
}

async function getHomePage() {
  const [page, curriculum, activities] = await Promise.all([getPage('home'), getPage('curriculum'), getActivities()]);
  return { page, curriculum, activities };
}

// ─── Public pages ─────────────────────────────────────────────────────────────

async function getTeam() {
  return cached('team', () =>
    prisma.teamMember.findMany({
      where: { isPublished: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    })
  );
}

// Published documents for an audience, grouped by category: [{ category, documents: [...] }]
async function getDocuments(audiences) {
  return cached(`documents:${audiences.join(',')}`, async () => {
    const documents = await prisma.document.findMany({
      where: { isPublished: true, audience: { in: audiences } },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, description: true, category: true, fileName: true, fileSize: true, audience: true, updatedAt: true },
    });
    const groups = new Map();
    for (const doc of documents) {
      if (!groups.has(doc.category)) groups.set(doc.category, []);
      groups.get(doc.category).push(doc);
    }
    return [...groups].map(([category, docs]) => ({ category, documents: docs }));
  });
}

const ALBUM_CARD = {
  id: true,
  title: true,
  slug: true,
  date: true,
  photos: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], take: 1, select: { imageUrl: true } },
  _count: { select: { photos: true } },
};

// Published activity by slug with its published albums and videos, or null.
async function getActivity(slug) {
  return cached(`activity:${slug}`, () =>
    prisma.activity.findFirst({
      where: { slug, isPublished: true },
      include: {
        albums: { where: { isPublished: true }, orderBy: [{ date: { sort: 'desc', nulls: 'last' } }], select: ALBUM_CARD },
        videos: { where: { isPublished: true }, orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { displayOrder: 'asc' }] },
      },
    })
  );
}

async function getGallery() {
  return cached('gallery', async () => {
    const [albums, videos] = await Promise.all([
      prisma.album.findMany({
        where: { isPublished: true },
        orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        select: ALBUM_CARD,
      }),
      prisma.video.findMany({
        where: { isPublished: true },
        orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { displayOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    return { albums, videos };
  });
}

async function getAlbum(slug) {
  return cached(`album:${slug}`, () =>
    prisma.album.findFirst({
      where: { slug, isPublished: true },
      include: {
        activity: { select: { title: true, slug: true, isPublished: true } },
        photos: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    })
  );
}

// Published URLs for sitemap.xml
async function getSitemapEntries() {
  return cached('sitemap', async () => {
    const [pages, activities, albums] = await Promise.all([
      prisma.pageContent.findMany({ select: { slug: true, updatedAt: true } }),
      prisma.activity.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
      prisma.album.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
    ]);
    const pageUpdated = Object.fromEntries(pages.map((p) => [p.slug, p.updatedAt]));
    const staticPaths = { '/': 'home', '/about': 'about', '/team': 'team', '/curriculum': 'curriculum', '/gallery': 'gallery', '/contact': 'contact' };
    return [
      ...Object.entries(staticPaths).map(([loc, slug]) => ({ loc, lastmod: pageUpdated[slug] || null })),
      ...activities.map((a) => ({ loc: `/activities/${a.slug}`, lastmod: a.updatedAt })),
      ...albums.map((a) => ({ loc: `/gallery/${a.slug}`, lastmod: a.updatedAt })),
    ];
  });
}

module.exports = {
  clearCache,
  getPageConfig,
  rowToValues,
  valuesToRow,
  getPage,
  getSite,
  getPartners,
  getActivities,
  getHomePage,
  getTeam,
  getDocuments,
  getActivity,
  getGallery,
  getAlbum,
  getSitemapEntries,
};
