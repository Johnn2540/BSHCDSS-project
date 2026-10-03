const baseNavigation = require('../config/navigation');
const content = require('../services/content');

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

// Makes site-wide data available to every view (header, footer, nav state).
async function siteLocals(req, res, next) {
  const [site, partners, activities] = await Promise.all([
    content.getSite(),
    content.getPartners(),
    content.getActivities(),
  ]);
  res.locals.site = site;
  res.locals.partners = partners;
  res.locals.navigation = buildNavigation(activities);
  res.locals.currentPath = req.path;
  // Absolute URLs for canonical and Open Graph tags. APP_URL should be set in production.
  const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.locals.baseUrl = baseUrl;
  res.locals.canonicalUrl = baseUrl + (req.path === '/' ? '/' : req.path.replace(/\/$/, ''));
  next();
}

module.exports = siteLocals;
