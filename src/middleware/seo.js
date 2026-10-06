const { PUBLIC_PAGES } = require('../config/seo');
const { indexingEnabled } = require('../services/seo');

function indexingRules(req, res, next) {
  const privateRoute = /^\/(admin|tutor|login|forgot-password|reset-password|logout|documents|api)(\/|$)/i.test(req.path);
  if (!indexingEnabled() || privateRoute || req.path === '/healthz' || !['GET', 'HEAD'].includes(req.method)) {
    res.locals.noindex = true;
    res.locals.robotsPolicy = 'noindex, nofollow';
    res.set('X-Robots-Tag', res.locals.robotsPolicy);
  }
  next();
}

function canonicalPaths(req, res, next) {
  if (!['GET', 'HEAD'].includes(req.method)) return next();

  // Express routes are case-insensitive; published slugs use lowercase characters.
  // Consolidate those variants with the same paths used by links and the sitemap.
  const path = req.path.replace(/\/+$/, '').toLowerCase() || '/';
  if (!PUBLIC_PAGES[path] && !/^\/(activities|gallery)\/[a-z0-9-]+$/.test(path)) return next();

  const queryIndex = req.originalUrl.indexOf('?');
  let query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
  const firstAnnouncementsPage = path === '/announcements' && req.query.page === '1';
  if (firstAnnouncementsPage) {
    const params = new URLSearchParams(query.slice(1));
    params.delete('page');
    query = params.size ? '?' + params.toString() : '';
  }
  if (req.path !== path || firstAnnouncementsPage) {
    return res.redirect(308, path + query);
  }
  next();
}

module.exports = { indexingRules, canonicalPaths };
