# Custom domain activation

Production website: `https://kubshcdss.com`

Vercel project: `johnstone-s-projects/k-u-bshcdss-project`

## Current status

On 5 October 2026, both domains were added to the existing Vercel project:

- `kubshcdss.com` is assigned to the production website.
- `www.kubshcdss.com` has a permanent 308 redirect to `kubshcdss.com`.

The website now responds over HTTPS on the custom domain. A missing Vercel origin certificate caused Cloudflare error 525 during activation; a certificate covering both domains was issued and has automatic renewal enabled. The production `APP_URL` is `https://kubshcdss.com`; the domain activation deployment was `dpl_2TVy2xcMRuk5fXhPZGgGmJ8AW6Au`.

On 6 October 2026, delegated tutor administration was released as [deployment dpl_Fx9xtciRbQBJ9ZPQGztMycSfqrEk](https://vercel.com/johnstone-s-projects/k-u-bshcdss-project/Fx9xtciRbQBJ9ZPQGztMycSfqrEk), with production status **Ready** and the existing primary/www aliases. The build regenerated Prisma, verified SMTP connectivity without sending mail and confirmed all eight database migrations were applied. Live database health, authentication forms, protected-route redirects, HTTP/www redirects and SEO checks for all 11 public sitemap URLs passed. See [delegated administration](admin-permissions.md) for the promotion controls and permission boundary.

Verified: public pages, canonical URLs, sitemap, robots sitemap URL, permanent www redirect, HTTP-to-HTTPS redirect, tutor login, all five tutor pages, search, 14 document links and protected downloads. Browser checks also verified contact email decoding, menus, form controls, native video, reduced motion and script fallbacks. The verification session was logged out; no account passwords or resource records were changed.

Public registration identifies Spaceship, Inc. as the registrar, with these delegated nameservers at the last check:

```text
nile.ns.cloudflare.com
osmar.ns.cloudflare.com
```

Google and Cloudflare public resolvers now both resolve the domain successfully. However, their NS responses and direct Cloudflare nameserver responses list `nile.ns.cloudflare.com` and `cruz.ns.cloudflare.com`, while registry data lists the pair above. Confirmation of the assigned pair from the user's Cloudflare Overview page is still pending. Do not infer that either second nameserver should be replaced without that confirmation. The user should confirm that the registrar lists Cloudflare's exact assigned pair and that the zone status is Active.

Registrar ownership and DNS hosting can be separate services. Nameserver changes belong at the company where the domain was purchased; website DNS records belong in the active Cloudflare zone. No Cloudflare account credentials are configured in this workspace.

## Required DNS records

These are the exact recommended records returned by Vercel for this project on 5 October 2026. Recheck Vercel's domain settings before applying them if this guide is used later.

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 216.198.79.1 |
| A | @ | 64.29.17.1 |
| CNAME | www | ab214593f8dec7fd.vercel-dns-017.com |

Some providers require `kubshcdss.com` instead of `@`. The live website currently uses Cloudflare's proxy. Public lookups therefore return Cloudflare addresses rather than these origin addresses. If certificate validation ever fails, compare the origin records with Vercel's current recommendations and check the HTTP challenge route; Vercel also supports direct hosting using **DNS only**. Keep other DNS records, including email records, in place.

## Operating settings

1. Keep Vercel **Production** set to `APP_URL=https://kubshcdss.com`. Keep local development's `APP_URL` at its localhost address.
2. Keep **Always Use HTTPS** enabled in Cloudflare's SSL/TLS > Edge Certificates settings. The final HTTP check returned a 308 redirect to HTTPS.
3. Run `vercel domains verify kubshcdss.com --scope johnstone-s-projects` and the equivalent command for `www.kubshcdss.com` when troubleshooting domain configuration. Both passed verification during this release.
4. Use `node scripts/check-motion-browser.js --live --interactions-only` for public browser behavior checks on the custom domain. The check verifies that Cloudflare email obfuscation restores working project and team mail links.
5. Password-setup and recovery links use `APP_URL`; SMTP needs its own working configuration. No invitation or recovery emails were sent during domain verification.

No additional application routing code was required for this domain assignment.

References: [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Cloudflare activation](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/), [Vercel certificate and proxy troubleshooting](https://vercel.com/docs/domains/troubleshooting).
