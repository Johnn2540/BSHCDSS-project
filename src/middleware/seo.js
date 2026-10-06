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
  if (['GET', 'HEAD'].includes(req.method) && req.path.length > 1 && req.path.endsWith('/')) {
    const path = req.path.replace(/\/+$/, '');
    if (PUBLIC_PAGES[path] || /^\/(activities|gallery)\/[a-z0-9-]+$/.test(path)) {
      const queryIndex = req.originalUrl.indexOf('?');
      return res.redirect(308, path + (queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : ''));
    }
  }
  next();
}

module.exports = { indexingRules, canonicalPaths };
