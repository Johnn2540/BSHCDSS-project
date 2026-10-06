const content = require('../services/content');
const { siteOrigin, indexingEnabled, sitemapXml } = require('../services/seo');

function robots(req, res) {
  const enabled = indexingEnabled();
  const lines = enabled ? [
    'User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /tutor',
    'Disallow: /documents/', 'Disallow: /api/', 'Disallow: /healthz', '',
    `Sitemap: ${siteOrigin(req)}/sitemap.xml`, '',
  ] : ['User-agent: *', 'Disallow: /', ''];
  res.set('X-Robots-Tag', 'noindex');
  res.set('Cache-Control', enabled ? 'public, max-age=300' : 'private, no-store');
  res.type('text/plain').send(lines.join('\n'));
}

async function sitemap(req, res) {
  const enabled = indexingEnabled();
  const entries = enabled ? await content.getSitemapEntries() : [];
  res.set('X-Robots-Tag', 'noindex');
  res.set('Cache-Control', enabled ? 'public, max-age=60' : 'private, no-store');
  res.type('application/xml').send(sitemapXml(siteOrigin(req), entries));
}

module.exports = { robots, sitemap };
