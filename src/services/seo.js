const { PUBLIC_PAGES } = require('../config/seo');

function siteOrigin(req, env = process.env) {
  const url = new URL(env.APP_URL || `${req.protocol}://${req.get('host')}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid public site URL.');
  return url.origin;
}

function indexingEnabled(env = process.env) {
  return env.VERCEL_ENV ? env.VERCEL_ENV === 'production' : env.NODE_ENV === 'production';
}

function text(value, limit = Infinity) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= limit) return cleaned;
  const boundary = cleaned.lastIndexOf(' ', limit - 1);
  return cleaned.slice(0, boundary > 0 ? boundary : limit - 1).trimEnd() + '…';
}

function publicUrl(value, origin) {
  if (!value) return null;
  try {
    const url = new URL(value, origin + '/');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

// Escape characters that could terminate an inline JSON-LD script. The result is JSON,
// never HTML supplied by an administrator or visitor.
function scriptJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
  })[character]);
}

function buildPageSeo({ site, origin, path, page = {}, title, description, image, imageAlt, pageNumber = 1, parent }) {
  const canonical = origin + path + (pageNumber > 1 ? `?page=${pageNumber}` : '');
  const heading = text(title || page.title || site.fullName);
  let searchTitle = text(page.seoTitle || heading);
  if (pageNumber > 1) searchTitle += ` – Page ${pageNumber}`;
  if (!searchTitle.toLowerCase().endsWith(text(site.shortName).toLowerCase())) searchTitle += ` | ${site.shortName}`;
  const summary = text(page.seoDescription || description || page.summary || page.description || page.body || site.tagline, 160);
  const brandedImage = site.brand?.ogImage || site.logoUrl;
  let imageUrl = publicUrl(image, origin);
  if (imageUrl?.startsWith('https://res.cloudinary.com/') && imageUrl.includes('/image/upload/')) {
    imageUrl = imageUrl.replace('/image/upload/', '/image/upload/f_auto,q_auto,w_1200,h_630,c_fill/');
  }
  const usesBrandImage = !imageUrl;
  imageUrl ||= publicUrl(brandedImage, origin);
  const imageDescription = text(imageAlt || (usesBrandImage ? site.fullName : heading));
  const organizationId = origin + '/#organization';
  const websiteId = origin + '/#website';
  const webpageId = canonical + '#webpage';
  const graph = [];
  if (path === '/') {
    const organization = {
      '@type': 'Organization', '@id': organizationId,
      name: site.fullName, alternateName: site.shortName, url: origin + '/', description: site.tagline,
    };
    const logo = publicUrl(site.brand?.emblem?.png256 || site.logoUrl, origin);
    if (logo) organization.logo = logo;
    if (site.ministry) organization.parentOrganization = { '@type': 'GovernmentOrganization', name: site.ministry };
    if (site.contact?.email) organization.email = site.contact.email;
    const internationalPhone = String(site.contact?.phone || '').replace(/[\s().-]/g, '');
    if (/^\+[1-9]\d{7,14}$/.test(internationalPhone)) organization.telephone = internationalPhone;
    if (site.contact?.address?.length) organization.address = {
      '@type': 'PostalAddress', streetAddress: site.contact.address.join(', '),
      ...(site.contact.locality ? { addressLocality: site.contact.locality } : {}),
      ...(/^[A-Z]{2}$/.test(site.contact.countryCode || '') ? { addressCountry: site.contact.countryCode } : {}),
    };
    graph.push(organization, {
      '@type': 'WebSite', '@id': websiteId, url: origin + '/', name: site.shortName,
      alternateName: site.fullName, inLanguage: 'en', publisher: { '@id': organizationId },
    });
  }
  const webpage = {
    '@type': PUBLIC_PAGES[path]?.type || (path.startsWith('/gallery/') ? 'CollectionPage' : 'WebPage'),
    '@id': webpageId, url: canonical, name: searchTitle, description: summary,
    inLanguage: 'en', isPartOf: { '@id': websiteId }, publisher: { '@id': organizationId },
  };
  if (imageUrl) webpage.primaryImageOfPage = { '@type': 'ImageObject', url: imageUrl, caption: imageDescription };
  graph.push(webpage);
  if (path !== '/') {
    const crumbs = [{ name: 'Home', item: origin + '/' }];
    if (parent) crumbs.push({ name: parent.name, item: origin + parent.path });
    crumbs.push({ name: heading, item: canonical });
    const breadcrumbId = canonical + '#breadcrumb';
    webpage.breadcrumb = { '@id': breadcrumbId };
    graph.push({ '@type': 'BreadcrumbList', '@id': breadcrumbId, itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem', position: index + 1, ...crumb,
    })) });
  }
  return {
    title: searchTitle, description: summary, canonical, image: imageUrl, imageAlt: imageDescription,
    imageWidth: usesBrandImage && site.brand ? 1200 : null,
    imageHeight: usesBrandImage && site.brand ? 630 : null,
    card: imageUrl ? 'summary_large_image' : 'summary',
    structuredData: scriptJson({ '@context': 'https://schema.org', '@graph': graph }),
  };
}

function setPageSeo(req, res, options) {
  res.locals.seo = buildPageSeo({ site: res.locals.site, origin: res.locals.baseUrl || siteOrigin(req), ...options });
  if (options.noindex) {
    res.locals.noindex = true;
    res.locals.robotsPolicy ||= 'noindex, follow';
    res.set('X-Robots-Tag', res.locals.robotsPolicy);
  }
}

function latestDate(values, asOf = new Date()) {
  const valid = values.filter(Boolean).map(value => new Date(value)).filter(value => Number.isFinite(value.getTime()) && value <= asOf);
  return valid.length ? new Date(valid.reduce((latest, value) => Math.max(latest, value.getTime()), 0)).toISOString() : null;
}

const xmlEscape = value => String(value).replace(/[<>&'"]/g, character => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
})[character]);

function sitemapXml(origin, entries) {
  const urls = entries.map(entry => `  <url><loc>${xmlEscape(origin + entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

module.exports = { siteOrigin, indexingEnabled, buildPageSeo, setPageSeo, scriptJson, latestDate, sitemapXml };
