const baseNavigation = require('../config/navigation');
const content = require('../services/content');
const notifications = require('../services/notifications');
const { siteOrigin } = require('../services/seo');

// The Project Activities dropdown lists the published activities from the database,
// so activities added or removed in the admin panel appear in the menu automatically.
// With no published activities the dropdown is left out entirely.
function buildNavigation(activities) {
  return baseNavigation
    .map((item) =>
      item.children
        ? { ...item, children: activities.map((a) => ({ label: a.title, href: `/activities/${a.slug}` })) }
        : item
    )
    .filter((item) => !item.children || item.children.length);
}

// Partners strip in the footer: the set is repeated until it's long enough to fill wide
// screens, then rendered twice so the right-to-left loop is seamless. Repeats are marked
// `dup` so screen readers and keyboard users meet each partner only once.
const MIN_TILES_PER_SET = 6;
const SECONDS_PER_TILE = 4;
function buildPartnerMarquee(partners) {
  if (!partners.length) return null;
  const repeats = Math.ceil(MIN_TILES_PER_SET / partners.length);
  const set = [];
  for (let r = 0; r < repeats; r += 1) partners.forEach((p) => set.push({ ...p, dup: r > 0 }));
  return { set, duration: set.length * SECONDS_PER_TILE };
}

// Makes site-wide data available to every view (header, footer, nav state).
async function siteLocals(req, res, next) {
  const [site, partners, activities, publicNotifications] = await Promise.all([
    content.getSite(),
    content.getPartners(),
    content.getActivities(),
    /^\/(admin|tutor)(\/|$)/.test(req.path) ? null : notifications.getPublicNotifications().catch(() => ({
      items: [], total: 0, unreadCount: 0, unavailable: true,
    })),
  ]);
  res.locals.publicNotifications = publicNotifications;
  res.locals.site = site;
  res.locals.partners = partners;
  res.locals.partnerMarquee = buildPartnerMarquee(partners);
  res.locals.navigation = buildNavigation(activities);
  res.locals.currentPath = req.path;
  // Absolute URLs for canonical and Open Graph tags. APP_URL should be set in production.
  const baseUrl = siteOrigin(req);
  res.locals.baseUrl = baseUrl;
  res.locals.canonicalUrl = baseUrl + (req.path === '/' ? '/' : req.path.replace(/\/$/, ''));
  next();
}

module.exports = siteLocals;
