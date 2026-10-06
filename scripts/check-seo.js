// Read-only checks. No forms are submitted and no production content is changed.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const live = process.argv.includes('--live');
const productionOrigin = 'https://kubshcdss.com';
let server, db;
const decode = value => String(value || '').replace(/&(amp|quot|apos|lt|gt);|&#(?:x([\da-f]+)|(\d+));/gi, (match, name, hex, decimal) =>
  name ? ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[name.toLowerCase()] : String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10)));
const attribute = (html, pattern) => decode(pattern.exec(html)?.[1]);
async function main() {
  let base = productionOrigin;
  if (!live) {
    // Exercise production indexing while using the local app and the configured DB.
    process.env.NODE_ENV = 'production'; delete process.env.VERCEL_ENV; process.env.APP_URL = productionOrigin;
    db = require('../src/lib/db');
    server = require('../src/app').listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
  }
  const robotsResponse = await fetch(base + '/robots.txt');
  assert.equal(robotsResponse.status, 200); assert.equal(robotsResponse.headers.get('set-cookie'), null);
  const robots = await robotsResponse.text();
  assert(robots.includes('Sitemap: ' + productionOrigin + '/sitemap.xml'));
  assert(!robots.includes('Disallow: /\n')); assert(!robots.includes('Disallow: /login'));
  const sitemapResponse = await fetch(base + '/sitemap.xml');
  assert.equal(sitemapResponse.status, 200); assert.equal(sitemapResponse.headers.get('set-cookie'), null);
  assert.match(sitemapResponse.headers.get('content-type'), /xml/);
  const xml = await sitemapResponse.text();
  const urls = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g), match => decode(match[1]));
  assert(urls.length >= 7); assert.equal(new Set(urls).size, urls.length);
  for (const url of urls) assert.equal(new URL(url).origin, productionOrigin);
  for (const [, date] of xml.matchAll(/<lastmod>(.*?)<\/lastmod>/g)) assert(new Date(date) <= new Date());
  const titles = new Set();
  for (const canonical of urls) {
    const { pathname, search } = new URL(canonical);
    assert(!/^\/(admin|tutor|login|documents|api)(\/|$)/.test(pathname));
    const response = await fetch(base + pathname + search);
    assert.equal(response.status, 200, pathname);
    assert(!response.headers.get('x-robots-tag')?.includes('noindex'), pathname + ' is indexable');
    const html = await response.text();
    const title = attribute(html, /<title>(.*?)<\/title>/s);
    const description = attribute(html, /<meta name="description" content="([^"]*)"/);
    assert(title && description && description.length <= 160, pathname + ' has concise metadata');
    assert(!titles.has(title), pathname + ' has a distinct title'); titles.add(title);
    assert.equal(attribute(html, /<link rel="canonical" href="([^"]*)"/), canonical);
    assert.equal(attribute(html, /<meta property="og:url" content="([^"]*)"/), canonical);
    assert.equal(attribute(html, /<meta name="twitter:title" content="([^"]*)"/), title);
    assert.match(attribute(html, /<meta property="og:image" content="([^"]*)"/), /^https:\/\//);
    const ld = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s.exec(html);
    assert(ld, pathname + ' has structured data');
    const data = JSON.parse(ld[1]); assert.equal(data['@context'], 'https://schema.org');
    assert(data['@graph'].some(node => node.url === canonical));
    if (pathname === '/') {
      const organization = data['@graph'].find(node => node['@type'] === 'Organization');
      assert(organization); assert.equal(organization.address?.addressCountry, 'SS');
      assert.equal(organization.address?.addressLocality, 'Juba');
      if (organization.telephone) assert.match(organization.telephone, /^\+[1-9]\d{7,14}$/);
    }
    else assert(data['@graph'].some(node => node['@type'] === 'BreadcrumbList'));
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, pathname + ' has one main heading');
    console.log('PASS ' + pathname + search + ': metadata, canonical, share tags and structured data');
  }
  for (const route of ['/login', '/forgot-password', '/reset-password/seo-check-missing-token', '/admin', '/tutor', '/documents/seo-check-missing-document/download', '/seo-check-missing-page']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert(response.status < 500, route + ' is functional');
    assert.match(response.headers.get('x-robots-tag'), /noindex/, route + ' is excluded from indexing');
  }
  const filtered = await fetch(base + '/curriculum?q=teacher');
  assert.equal(filtered.status, 200); assert.match(filtered.headers.get('x-robots-tag'), /noindex/);
  const filteredHtml = await filtered.text();
  assert.match(filteredHtml, /name="robots" content="noindex, follow"/);
  assert.doesNotMatch(filteredHtml, /application\/ld\+json/);
  const slash = await fetch(base + '/about/?utm_source=seo-check', { redirect: 'manual' });
  assert.equal(slash.status, 308); assert.equal(slash.headers.get('location'), '/about?utm_source=seo-check');
  console.log('PASS robots, published sitemap, private routes, filtered search and permanent URL normalization');
  console.log('SEO verification passed for ' + urls.length + ' public URLs.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) { await db.prisma.$disconnect(); await db.pool.end(); }
});
