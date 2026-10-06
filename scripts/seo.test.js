const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const Handlebars = require('handlebars').create();
const { siteOrigin, indexingEnabled, buildPageSeo, latestDate, sitemapXml } = require('../src/services/seo');
const { indexingRules, canonicalPaths } = require('../src/middleware/seo');
const { createFixture, prisma, state, reset, announcement, content } = require('./fixtures/publicNotifications');
const seoController = require('../src/controllers/seoController');
const config = require('../src/config/pages');
const site = {
  shortName: 'BSHCDSS', fullName: 'Building Skills for Human Capacity Development in South Sudan',
  tagline: 'Teacher education in South Sudan.', ministry: 'Ministry of General Education and Instruction',
  country: 'Republic of South Sudan', logoUrl: '/images/logo.svg',
  brand: { ogImage: '/images/brand/og-image.jpg', emblem: { png256: '/images/brand/logo-emblem-256.png' } },
  contact: { email: 'project@example.test', phone: '+211 900 000000', locality: 'Juba', countryCode: 'SS', address: ['Ministry of General Education and Instruction', 'Juba, Republic of South Sudan'] },
};
const origin = 'https://example.test';
for (const [name, helper] of Object.entries(require('../src/helpers/handlebars'))) Handlebars.registerHelper(name, helper);
const head = Handlebars.compile(fs.readFileSync(path.join(__dirname, '../src/views/partials/seo-head.hbs'), 'utf8'));

test('canonical URLs use the configured origin and indexing is limited to production', () => {
  const req = { protocol: 'http', get: () => 'attacker.example' };
  assert.equal(siteOrigin(req, { APP_URL: origin + '/?tracking=true' }), origin);
  assert.throws(() => siteOrigin(req, { APP_URL: 'javascript:alert(1)' }));
  assert.equal(indexingEnabled({ NODE_ENV: 'production' }), true);
  assert.equal(indexingEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(indexingEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }), false);
  assert.equal(indexingEnabled({ VERCEL_ENV: 'production' }), true);
});

test('all public page defaults have distinct, concise metadata and CMS controls', () => {
  const pages = config.filter(page => page.fields.some(field => field.name === 'seoTitle'));
  assert.equal(pages.length, 7);
  const descriptions = [];
  for (const page of pages) {
    const values = Object.fromEntries(page.fields.map(field => [field.name, field.default]));
    assert(values.seoTitle.length <= 60);
    assert(values.seoDescription.length >= 100 && values.seoDescription.length <= 160);
    descriptions.push(values.seoDescription);
  }
  assert.equal(new Set(descriptions).size, pages.length);
  assert(config.find(page => page.slug === 'site').fields.some(field => field.name === 'googleSiteVerification'));
});

test('home structured data uses real project identity; CMS overrides and share tags agree', () => {
  const seo = buildPageSeo({ site, origin, path: '/', page: { title: 'Visible heading', seoTitle: 'Custom search title', seoDescription: 'Custom page description.' } });
  assert.equal(seo.title, 'Custom search title | BSHCDSS');
  assert.equal(seo.description, 'Custom page description.');
  assert.equal(seo.image, origin + '/images/brand/og-image.jpg');
  const graph = JSON.parse(seo.structuredData)['@graph'];
  assert.deepEqual(graph.map(node => node['@type']), ['Organization', 'WebSite', 'WebPage']);
  assert.equal(graph[0].name, site.fullName);
  assert.equal(graph[0].email, site.contact.email);
  assert.equal(graph[0].address.addressCountry, 'SS');
  assert.equal(graph[0].address.addressLocality, 'Juba');
  assert.equal(graph[0].telephone, '+211900000000');
  const localPhone = buildPageSeo({ site: { ...site, contact: { ...site.contact, phone: '0926540368' } }, origin, path: '/' });
  assert.equal(JSON.parse(localPhone.structuredData)['@graph'][0].telephone, undefined);
  const html = head({ seo, site, cspNonce: 'test-nonce' });
  assert.match(html, /name="twitter:title" content="Custom search title \| BSHCDSS"/);
  assert.match(html, /property="og:image:alt"/);
  assert.match(html, /type="application\/ld\+json" nonce="test-nonce"/);
});

test('pagination has its own canonical and gallery breadcrumbs reflect the public navigation', () => {
  const seo = buildPageSeo({ site, origin, path: '/announcements', page: { title: 'News' }, pageNumber: 2 });
  assert.equal(seo.canonical, origin + '/announcements?page=2');
  assert.match(seo.title, /Page 2/);
  const album = buildPageSeo({ site, origin, path: '/gallery/workshop', page: { title: 'Workshop' }, parent: { name: 'Pictures and Videos', path: '/gallery' } });
  const crumbs = JSON.parse(album.structuredData)['@graph'].find(node => node['@type'] === 'BreadcrumbList').itemListElement;
  assert.deepEqual(crumbs.map(crumb => crumb.item), [origin + '/', origin + '/gallery', origin + '/gallery/workshop']);
});

test('JSON-LD and HTML remain safe when CMS text contains script delimiters', () => {
  const attack = '</script><script>alert("xss")</script>\u2028&';
  const seo = buildPageSeo({ site, origin, path: '/team', page: { title: attack, summary: attack }, image: 'javascript:alert(1)' });
  assert(!seo.structuredData.includes('</script>'));
  assert(JSON.parse(seo.structuredData)['@graph'][0].name.includes('</script><script>alert("xss")</script>'));
  const html = head({ seo, site, cspNonce: 'test' });
  assert(!html.includes('<script>alert'));
  assert.equal((html.match(/<script /g) || []).length, 1);
  assert.equal(seo.image, origin + '/images/brand/og-image.jpg');
  const privateHtml = head({ seo, site, noindex: true, robotsPolicy: 'noindex, nofollow' });
  assert.doesNotMatch(privateHtml, /rel="canonical"|application\/ld\+json|og:url/);
});

test('sitemap dates use content updates, omit invalid or future dates, and XML is escaped', () => {
  const asOf = new Date('2026-10-06T12:00:00Z');
  assert.equal(latestDate(['2026-10-05', 'invalid', '2027-01-01', '2026-10-06T10:00:00Z'], asOf), '2026-10-06T10:00:00.000Z');
  assert.equal(latestDate([null, 'invalid', '2027-01-01'], asOf), null);
  assert.match(sitemapXml(origin, [{ loc: '/?page=2&x=1', lastmod: null }]), /page=2&amp;x=1/);
});

test('HTTP indexing rules preserve public pages and redirects while excluding private and preview routes', async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV, APP_URL: process.env.APP_URL };
  process.env.NODE_ENV = 'production'; delete process.env.VERCEL_ENV; process.env.APP_URL = origin;
  const app = express(); app.use(indexingRules, canonicalPaths);
  app.get('/robots.txt', seoController.robots);
  app.get('/sitemap.xml', seoController.sitemap);
  app.use((req, res) => res.json({ noindex: Boolean(res.locals.noindex) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(base + '/about')).headers.get('x-robots-tag'), null);
    const slash = await fetch(base + '/about/?utm_source=test', { redirect: 'manual' });
    assert.equal(slash.status, 308); assert.equal(slash.headers.get('location'), '/about?utm_source=test');
    for (const route of ['/login', '/forgot-password', '/reset-password/private-token', '/admin/team', '/tutor', '/documents/file/download', '/healthz']) {
      assert.equal((await fetch(base + route)).headers.get('x-robots-tag'), 'noindex, nofollow');
    }
    assert.equal((await fetch(base + '/contact', { method: 'POST' })).headers.get('x-robots-tag'), 'noindex, nofollow');
    const robots = await (await fetch(base + '/robots.txt')).text();
    assert.match(robots, /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
    assert.doesNotMatch(robots, /Disallow: \/(?:login|reset-password|admin|tutor|api|healthz)/);
    assert.match(robots, /Disallow: \/documents\//);
    process.env.VERCEL_ENV = 'preview';
    assert.equal((await fetch(base + '/about')).headers.get('x-robots-tag'), 'noindex, nofollow');
    const previewRobots = await fetch(base + '/robots.txt');
    assert.equal(previewRobots.headers.get('cache-control'), 'private, no-store');
    assert.equal(await previewRobots.text(), 'User-agent: *\nAllow: /\n');
    assert.doesNotMatch(await (await fetch(base + '/sitemap.xml')).text(), /<url>/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [name, value] of Object.entries(previous)) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

test('public duplicate URLs redirect once while queries, forms and private paths retain their behavior', async () => {
  const app = express(); app.use(canonicalPaths);
  app.use((req, res) => res.json({ path: req.path }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const [route, target, method = 'GET'] of [
      ['/ABOUT/?utm_source=seo&ref=a%2Fb', '/about?utm_source=seo&ref=a%2Fb'],
      ['/Team', '/team'],
      ['/ACTIVITIES/In-Service-Training/', '/activities/in-service-training'],
      ['/Gallery/Workshop///', '/gallery/workshop', 'HEAD'],
      ['/announcements?page=1', '/announcements'],
      ['/ANNOUNCEMENTS/?page=1&utm_source=seo&ref=a%2Fb', '/announcements?utm_source=seo&ref=a%2Fb'],
      ['/announcements/?page=2', '/announcements?page=2'],
      ['/curriculum/?q=teacher&category=Language', '/curriculum?q=teacher&category=Language'],
    ]) {
      const response = await fetch(base + route, { method, redirect: 'manual' });
      assert.equal(response.status, 308, route);
      assert.equal(response.headers.get('location'), target, route);
      assert.equal((await fetch(base + target, { method, redirect: 'manual' })).status, 200, target + ' does not redirect again');
    }
    for (const [route, method = 'GET'] of [
      ['/about'], ['/announcements?page=2'], ['/announcements?page=0'],
      ['/announcements?page=1&page=2'], ['/admin/'], ['/api/public/notifications/'],
      ['/images/Logo.png'], ['/unknown/'], ['//attacker.example/'], ['/ABOUT/', 'POST'],
    ]) {
      assert.equal((await fetch(base + route, { method, redirect: 'manual' })).status, 200, route + ' is passed through');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('the actual announcements page renders page-two metadata and 404s out-of-range pages', async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV, APP_URL: process.env.APP_URL };
  process.env.NODE_ENV = 'production'; delete process.env.VERCEL_ENV; process.env.APP_URL = origin;
  reset(); state.announcements = Array.from({ length: 25 }, (_, index) => announcement('item-' + index)); content.clearCache();
  const server = createFixture().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const html = await (await fetch(base + '/announcements?page=2&utm_source=test')).text();
    const canonical = /rel="canonical" href="([^"]+)"/.exec(html)?.[1].replace(/&#x3D;/g, '=');
    assert.equal(canonical, origin + '/announcements?page=2');
    assert.match(html, /Page 2/);
    assert.match(html, /href="\/announcements"[^>]*>Previous page<\/a>/);
    assert.doesNotMatch(html, /href="\/announcements\?page=1"/);
    const response = await fetch(base + '/announcements?page=3');
    assert.equal(response.status, 404); assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.doesNotMatch(await response.text(), /application\/ld\+json/);
    process.env.VERCEL_ENV = 'preview';
    const preview = await fetch(base + '/announcements');
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get('x-robots-tag'), /noindex/);
    const previewHtml = await preview.text();
    assert.match(previewHtml, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(previewHtml, /rel="canonical"|application\/ld\+json/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [name, value] of Object.entries(previous)) value === undefined ? delete process.env[name] : process.env[name] = value;
    reset(); content.clearCache();
  }
});

test('sitemap generation includes published content updates and valid notice pagination only', async () => {
  const past = new Date('2026-10-01T00:00:00Z');
  const recent = new Date('2026-10-05T12:00:00Z');
  const newer = new Date('2026-10-06T00:00:00Z');
  prisma.pageContent.findMany = async () => [{ slug: 'team', updatedAt: past }];
  prisma.activity.findMany = async query => {
    assert.deepEqual(query.where, { isPublished: true }); return [{ id: 'a', slug: 'training', updatedAt: past }];
  };
  prisma.album.findMany = async query => {
    assert.deepEqual(query.where, { isPublished: true }); return [{ slug: 'photos', activityId: 'a', updatedAt: past, photos: [{ createdAt: recent }] }];
  };
  prisma.teamMember = { aggregate: async query => { assert.deepEqual(query.where, { isPublished: true }); return { _max: { updatedAt: newer } }; } };
  prisma.document = { findMany: async query => { assert.deepEqual(query.where, { isPublished: true, audience: 'PUBLIC', portalSection: 'DOCUMENTS' }); return [{ id: 'document', updatedAt: recent }]; } };
  prisma.video.findMany = async query => { assert.deepEqual(query.select, { activityId: true, updatedAt: true }); return []; };
  prisma.announcement.aggregate = async query => {
    assert.equal(query.where.audience, 'PUBLIC'); assert.equal(query.where.isPublished, true);
    assert(query.where.publishedAt.lte instanceof Date && query.where.updatedAt.lte instanceof Date);
    return { _max: { updatedAt: recent, publishedAt: past }, _count: { _all: 25 } };
  };
  content.clearCache();
  const entries = await content.getSitemapEntries();
  assert.equal(entries.find(entry => entry.loc === '/team').lastmod, newer.toISOString());
  assert.equal(entries.find(entry => entry.loc === '/gallery/photos').lastmod, recent.toISOString());
  assert.equal(entries.find(entry => entry.loc === '/gallery').lastmod, recent.toISOString());
  assert.equal(entries.find(entry => entry.loc === '/curriculum').lastmod, recent.toISOString());
  assert(entries.some(entry => entry.loc === '/announcements?page=2'));
  assert(!entries.some(entry => entry.loc.includes('page=3') || /admin|tutor|documents\//.test(entry.loc)));
});
