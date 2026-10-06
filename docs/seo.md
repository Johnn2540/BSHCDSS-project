# Search engine optimization

Production uses `https://kubshcdss.com`. Public pages have distinct editable search titles and descriptions, absolute canonical links, Open Graph and Twitter previews, and server-rendered JSON-LD. The homepage identifies the project with Organization and WebSite data. Public subpages identify their page type and breadcrumb path. These descriptions reflect the project's supplied information; they do not claim rankings, ratings or certifications.

Edit **Search result title** and **Search result description** in **Admin → Page content**, or in **Activities / Photo albums** for individual records. Page headings remain independent. Clearing a search field restores the heading or introductory-text fallback. Short names, ministry, public contact details and the verification code come from **Site settings and contact details**.

The office city and two-letter country code are editable in site settings; the supplied Juba office uses `SS` for South Sudan. A phone number appears in structured data only when it includes an explicit international country code. The visible contact numbers remain as saved.

`/sitemap.xml` contains the canonical public pages, published activities, published albums and existing announcements pages. Modification dates come from relevant published records, including team profiles, documents, photos and notices. Private and future notices, draft content, tutor resources and signed download URLs are excluded. No arbitrary `priority`, `changefreq` or current-time dates are added.

Announcements pagination has self-referencing canonical URLs. Tracking parameters do not enter canonicals. Filtered curriculum searches are `noindex, follow`; authentication, private routes, downloads and errors use `noindex` response headers. Account access still depends on the existing authentication middleware. Authentication pages remain crawlable so crawlers can read their `noindex` rules. Trailing slashes on public page URLs redirect permanently without changing POST/form routes.

Vercel previews, development deployments and local development use `noindex`; their robots file disallows crawling and their sitemap is empty. Only production is indexable. Configure the production `APP_URL` with the HTTPS primary domain. The robots and sitemap endpoints run before session and page-content middleware.

## Google Search Console setup

1. Open [Google Search Console](https://search.google.com/search-console) with the project's Google account and add the **Domain property** `kubshcdss.com`.
2. Copy Google's TXT verification record into Cloudflare DNS, then select **Verify** in Search Console. If using a URL-prefix property instead, the Google HTML verification tag's `content` value can be saved in **Admin → Page content → Site settings and contact details → Google Search Console verification code**.
3. Submit `https://kubshcdss.com/sitemap.xml` in **Sitemaps**.
4. Inspect the homepage and main public pages, then request indexing. Use [Google's Rich Results Test](https://search.google.com/test/rich-results) to check deployed structured data.
5. Monitor Page indexing, search performance and Core Web Vitals. Google chooses crawl timing and search appearance; metadata and structured data do not guarantee indexing or placement.

Search Console verification and submission require the owner of the Google account; no verification code has been invented or submitted by the application.

## Verification

```sh
npm run check:seo
node scripts/check-seo.js
node scripts/check-seo.js --live
```

The unit checks use isolated fixtures. The local and live checks read public pages, published content and metadata without posting forms or modifying content.

Implementation follows Google's [organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization), [pagination guidance](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading), [noindex rules](https://developers.google.com/search/docs/crawling-indexing/block-indexing) and [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
