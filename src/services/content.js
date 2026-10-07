// Content service: the single place public views get their content from.
// Reads from the database; page text falls back to defaults in src/config/pages.js
// until an admin saves that page. Results are cached briefly and the cache is
// cleared whenever an admin changes something (see clearCache).

const fs = require('fs');
const path = require('path');
const { prisma } = require('../lib/db');
const pageConfigs = require('../config/pages');
const curriculumCatalogue = require('../data/curriculumDocuments');
const tutorSections = require('../config/tutorSections');
const notifications = require('./notifications');
const { PUBLIC_PAGES } = require('../config/seo');
const { latestDate } = require('./seo');

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
  notifications.clearCache();
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
    const empty = field.type === 'lines' ? [] : field.type === 'image' ? null : '';
    if (!row) {
      values[field.name] = field.default ?? empty;
    } else if (COLUMN_FIELDS.includes(field.name)) {
      values[field.name] = row[field.name] ?? empty;
    } else {
      // A field added to the page after it was last saved isn't in `sections` yet: use its default.
      // (A field the admin deliberately cleared is saved as '' or [] and stays empty.)
      values[field.name] = field.name in sections ? sections[field.name] ?? empty : field.default ?? empty;
    }
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
    googleSiteVerification: page.googleSiteVerification,
    partnership: { buttonLabel: page.partnerButtonLabel },
    contact: {
      address: page.address || [],
      locality: page.addressLocality,
      countryCode: page.addressCountryCode?.toUpperCase(),
      phone: page.phone,
      secondaryPhone: page.secondaryPhone,
      email: page.email,
      hours: page.hours,
    },
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

// Latest published announcements for everyone (tutor-only ones never appear on the public site).
async function getPublicAnnouncements(limit = 3) {
  return cached(`announcements:public:${limit}`, () =>
    prisma.announcement.findMany({
      where: { audience: 'PUBLIC', isPublished: true, publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: { id: true, title: true, body: true, publishedAt: true },
    })
  );
}

async function getHomePage() {
  const [page, curriculum, activities, announcements, media] = await Promise.all([
    getPage('home'),
    getPage('curriculum'),
    getActivities(),
    getPublicAnnouncements(3),
    getHomeMedia(),
  ]);
  return { page, curriculum, activities, announcements, ...media };
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
async function getDocuments(audiences, portalSection = 'DOCUMENTS') {
  if (!tutorSections.some((section) => section.value === portalSection)) throw new Error('Unknown resource section.');
  return cached(`documents:${portalSection}:${audiences.join(',')}`, async () => {
    const documents = await prisma.document.findMany({
      where: { portalSection, isPublished: true, audience: { in: audiences } },
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

async function getTutorPortal() {
  const [page, sections] = await Promise.all([
    getPage('tutor-portal'),
    Promise.all(tutorSections.map(async (section) => {
      const [sectionPage, groups] = await Promise.all([
        getPage(section.pageSlug), getDocuments(['PUBLIC', 'TUTORS'], section.value),
      ]);
      return { ...section, page: sectionPage, groups, total: groups.reduce((sum, group) => sum + group.documents.length, 0) };
    })),
  ]);
  return { page, sections };
}

// Placement follows the source catalogue; admin edits and file replacements retain
// the same document ID. Existing imports with the original filename also match.
async function getActivityDocuments(slug) {
  const sources = curriculumCatalogue.filter((entry) => (entry.activitySlugs || []).includes(slug));
  if (!sources.length) return [];
  const groups = await getDocuments(['PUBLIC']);
  return groups.flatMap((group) => group.documents).filter((doc) =>
    sources.some((entry) => entry.id === doc.id || entry.fileName === doc.fileName)
  );
}

const ALBUM_CARD = {
  id: true,
  title: true,
  slug: true,
  date: true,
  photos: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], take: 1, select: { imageUrl: true } },
  _count: { select: { photos: true } },
};

// Home needs up to three album previews, the three latest videos for the gallery teasers, and a
// count. Taking only three of each avoids loading the entire gallery for every home-page cache refresh.
async function getHomeMedia() {
  return cached('home:media', async () => {
    const [albums, videos, videoCount] = await Promise.all([
      prisma.album.findMany({
        where: { isPublished: true },
        orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 3,
        select: ALBUM_CARD,
      }),
      // Videos are optional teasers: if their records cannot be read (for example a stale generated client that
      // cannot decode a provider), Home still renders with albums only instead of failing.
      Promise.resolve().then(() => prisma.video.findMany({
        where: { isPublished: true },
        orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { displayOrder: 'asc' }, { createdAt: 'desc' }],
        take: 3,
      })).catch((error) => {
        console.warn('[home] Video previews unavailable:', error && error.name ? error.name : 'error');
        return [];
      }),
      prisma.video.count({ where: { isPublished: true } }),
    ]);
    return { albums, videos, videoCount };
  });
}

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
    const asOf = new Date();
    const [pages, activities, albums, team, documents, videos, announcements] = await Promise.all([
      prisma.pageContent.findMany({ select: { slug: true, updatedAt: true } }),
      prisma.activity.findMany({ where: { isPublished: true }, select: { id: true, slug: true, updatedAt: true } }),
      prisma.album.findMany({ where: { isPublished: true }, select: {
        slug: true, activityId: true, updatedAt: true, photos: { select: { createdAt: true } },
      } }),
      prisma.teamMember.aggregate({ where: { isPublished: true }, _max: { updatedAt: true } }),
      prisma.document.findMany({ where: { isPublished: true, audience: 'PUBLIC', portalSection: 'DOCUMENTS' }, select: { id: true, fileName: true, updatedAt: true } }),
      // Provider-independent: sitemap generation never needs to decode video enums.
      prisma.video.findMany({ where: { isPublished: true }, select: { activityId: true, updatedAt: true } }),
      prisma.announcement.aggregate({ where: notifications.publishedWhere(asOf), _max: { updatedAt: true, publishedAt: true }, _count: { _all: true } }),
    ]);
    const pageUpdated = Object.fromEntries(pages.map((p) => [p.slug, p.updatedAt]));
    const albumDates = album => [album.updatedAt, ...album.photos.map(photo => photo.createdAt)];
    const mediaDates = [...albums.flatMap(albumDates), ...videos.map(video => video.updatedAt)];
    const announcementDate = latestDate(Object.values(announcements._max), asOf);
    const changedContent = {
      home: [...activities.map(activity => activity.updatedAt), ...mediaDates, announcementDate],
      team: [team._max.updatedAt], curriculum: documents.map(document => document.updatedAt),
      gallery: mediaDates, announcements: [announcementDate],
    };
    const modified = (slug, dates = []) => latestDate([pageUpdated.site, pageUpdated[slug], ...dates], asOf);
    return [
      ...Object.entries(PUBLIC_PAGES).map(([loc, { slug }]) => ({ loc, lastmod: modified(slug, changedContent[slug]) })),
      ...Array.from({ length: Math.max(0, Math.min(9999, Math.ceil(announcements._count._all / notifications.PAGE_SIZE)) - 1) }, (_, index) => ({
        loc: `/announcements?page=${index + 2}`, lastmod: modified('announcements', [announcementDate]),
      })),
      ...activities.map(activity => {
        const sources = curriculumCatalogue.filter(source => (source.activitySlugs || []).includes(activity.slug));
        const resourceDates = documents.filter(document => sources.some(source => source.id === document.id || source.fileName === document.fileName)).map(document => document.updatedAt);
        return { loc: `/activities/${encodeURIComponent(activity.slug)}`, lastmod: modified(null, [
          activity.updatedAt, ...resourceDates, ...albums.filter(album => album.activityId === activity.id).flatMap(albumDates),
          ...videos.filter(video => video.activityId === activity.id).map(video => video.updatedAt),
        ]) };
      }),
      ...albums.map(album => ({ loc: `/gallery/${encodeURIComponent(album.slug)}`, lastmod: modified(null, albumDates(album)) })),
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
  getPublicAnnouncements,
  getTeam,
  getDocuments,
  getTutorPortal,
  getActivityDocuments,
  getActivity,
  getGallery,
  getAlbum,
  getSitemapEntries,
};
