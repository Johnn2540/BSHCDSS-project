# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Institutional website for **BSHCDSS** (Building Skills for Human Capacity Development in South Sudan), a project under the **Ministry of General Education and Instruction (MoGEI)**, Republic of South Sudan.

The look is modelled on an official ministry website: formal, clean, trustworthy. The logo is in the project folder; use it in the header, footer and favicon.

## Working agreement

- **Work one phase at a time.** At the end of each phase, summarise what was done and **stop and wait for approval** before starting the next phase.
- Don't add features, pages or dependencies outside the brief without asking.

## Stack

- **Runtime / server:** Node.js + Express
- **Views:** express-handlebars (`.hbs`), server-rendered pages only. No frontend framework (no React/Vue/etc.). Small amounts of vanilla JS for progressive enhancement (e.g. mobile menu, dropdown) are fine.
- **Database:** Neon Postgres via Prisma
- **Auth:** session login with express-session + connect-pg-simple (sessions stored in Postgres), passwords hashed with bcrypt
- **Styling:** Tailwind CSS (built to a static CSS file, purged for production)
- **Uploads:** multer + Cloudinary (images and documents)
- **Email:** Nodemailer
- **Security:** helmet, CSRF protection, express-validator, express-rate-limit

## Secrets

- All secrets (database URL, session secret, Cloudinary keys, SMTP credentials, etc.) live in `.env`.
- `.env` is **never committed**. Keep it in `.gitignore` and maintain a `.env.example` with placeholder values only.

## Brand

Colours from the logo:

| Name   | Hex       | Use                      |
|--------|-----------|--------------------------|
| Blue   | `#0F47AF` | Primary                  |
| Green  | `#078930` | Primary                  |
| Red    | `#DA121A` | Accent only              |
| Yellow | `#FCDD09` | Accent only              |
| Black  | `#000000` | Text / neutrals          |
| White  | `#FFFFFF` | Backgrounds              |

Blue and green carry the design. Red and yellow are used sparingly (thin rules, highlights, badges), never as large fills. All text/background pairings must meet WCAG AA contrast (note: yellow on white fails; don't use it for text).

## Project facts (source: project Terms of Reference)

- Site brand stays "Building Skills for Human **Capacity** Development in South Sudan" (BSHCDSS), as on the logo (client decision). The World Bank project's official name is "Building Skills for Human **Capital** Development in South Sudan" (BSHCD, **P178654**, approved 15 May 2023, five years); use the official name only when describing the World Bank project itself.
- BSHCDSS = technical assistance for Component 1 (Teaching Skills to Strengthen Education Delivery): a comprehensive teacher training package for pre-service and in-service training; 24 months; 10 NTTIs; reports to the Project Director, PIU, MoGEI.
- Only publish figures with their source (2021 Education Census Report via the ToR). Don't invent statistics or claims; the "94% can't read by age 10" figure has no source in the ToR and is deliberately not used.
- Admin "lines" fields written as `label | value` (home statistics, About facts and components) are parsed by the `pairs` helper.

## Partners

- **MoGEI** (main partner)
- Kenyatta University
- World Bank Group

Partners are managed from the admin panel (name, logo, link, order).

## Navigation (in this order)

| Label                                   | Route                              |
|-----------------------------------------|------------------------------------|
| Home                                    | `/`                                |
| 1. About BSHCDSS                        | `/about`                           |
| 2. Project Team                         | `/team`                            |
| 3. Curriculum Design and Development    | `/curriculum`                      |
| 4. Project Activities (dropdown)        | —                                  |
| &nbsp;&nbsp;a) In-Service Teacher Training | `/activities/in-service-training` |
| &nbsp;&nbsp;b) Continuous Professional Development | `/activities/cpd`       |
| &nbsp;&nbsp;c) Digital Learning Management System | `/activities/lms`        |
| 5. Project in Pictures and Videos       | `/gallery`                         |
| Contact                                 | `/contact`                         |
| Login (button)                          | `/login`                           |

The dropdown must work with keyboard and touch, not hover only.

## User roles

- **Admin** — manages the whole site: page content, team members, activities, documents, albums, photos, videos, announcements, partners, and tutor accounts (add, approve, suspend, remove).
- **Tutor** — logs in to a portal containing Documents, Reports, and Plans and Activities. Published resources are **read-only**; tutors can change their own password.
- **Content administrator** — an active tutor with `canManageContent=true`, promoted by an administrator. Can use `/admin` to manage content, media, site settings and resources, including draft downloads; cannot manage accounts or grant/revoke permissions. Retains the `TUTOR` role. All `/admin/tutors` routes remain restricted to active `ADMIN` accounts. Use `src/services/permissions.js` for permission checks and home destinations; `loadUser` reloads the flag on every request. See `docs/admin-permissions.md` and run `npm run check:permissions`.
- **Public visitors** — no login.

Enforce roles server-side with route middleware; never rely on hiding links in templates.

## Rules

- **No hard-coded content.** All page text, team members, documents, albums and videos come from the database and are editable from the admin panel. `.hbs` files contain layout and markup only. (Structural labels like nav items and form labels are fine in templates.)
- **Videos** support YouTube/Vimeo embeds and imported Cloudinary video files. Import the supplied MP4 with `npm run videos:import`; later metadata and source-link edits belong in Admin > Videos. Cloudinary files use native browser controls with `preload="none"` and generated posters. Original files stay outside deployment bundles.
- **LMS page** (`/activities/lms`) is an information page with a link to an external LMS. Don't build an LMS.
- **No self-registration for admins.** The first admin is created via a seed script / CLI. Tutors are created or approved by an admin.
- **Mobile-first, accessible, fast on slow connections:**
  - Design for small screens first, then scale up.
  - Semantic HTML, landmarks, skip link, visible focus states, alt text on all images, labelled form fields.
  - Minimal JS, compressed/resized images via Cloudinary transformations, lazy-loaded images and embeds, cached static assets.

## Conventions

- Public notification bells use the existing published PUBLIC announcements, with `publishedAt <= now`. The shared panel is a native modal dialog enhanced by `public/js/notifications.js`; without JavaScript it links to `/announcements`. `src/services/notifications.js` reads a paginated feed, excludes tutor-only/draft/future notices, and counts all public unread notices since a server-issued timestamp. Read status stays in browser storage. `content.clearCache()` also invalidates the notification cache after admin changes. The read-only `/api/public/notifications` route runs before session middleware. Verify with `npm run check:notifications` and `npm run check:notifications:browser`; fixtures never publish real announcements.

- Motion is optional progressive enhancement in `public/js/motion.js`, separate from functional handlers in `site.js`. Use `data-motion="enter"` on selected content blocks and `data-motion="fade"` on workspace headings; section headings and auth titles are covered automatically. Nested targets are skipped. Keep form controls, document rows and native video controls outside moving containers. Content must remain visible with no JS or unsupported animation APIs. Respect reduced motion, cancel entrances on focus/printing/page hiding, and use fine-pointer hover movement only. Verify with `npm run check:motion` and `node scripts/check-tutor-browser.js`. Items of a `ul`/`ol`/`dl` that carry `data-motion` enter 70 ms apart (max four steps). Add `data-countup` (plus `tabular-nums`) to an element whose whole text is a whole number, such as `60,711`, `86:1` or `46%`, to count it up once when it scrolls into view; the real figure is exposed to screen readers throughout and restored if the count is interrupted. Browser checks that block scripts must use a trailing wildcard (`*/js/motion.js*`) because asset URLs carry a version query. The Home "Learn more about the project" button carries `cta-pulse`, a continuous CSS zoom and halo (CSS only, `prefers-reduced-motion: no-preference`, stopped on hover, focus and press); use it on one primary call to action at most, and remove the class to stop it. Blocks with `data-motion="enter"` (cards, figures, panels; never headings, paragraphs or lists) also zoom from 96.5% as they enter. Photos zoom as they scroll through the viewport: put `data-scroll-zoom` (optionally the largest extra size, e.g. `data-scroll-zoom="0.1"`; default 0.08, maximum 0.3) on an `<img>` whose parent, or nearest `[data-zoom-frame]`, is a fixed-size box with `overflow-hidden` (a `<picture>` parent resolves to its own parent). The frame is what is measured and what clips the enlarged photo, so never put rounded corners or shadows on the photo itself, and never use it on a frame whose height depends on the photo. Photos already on screen at load start at normal size; nothing runs under reduced motion or when printing. Do not add it to photos meant to be viewed whole (album photos, album covers) or to portraits and logos. Entrances are size-aware: a block starts at 90% when it fills under 40% of the screen width, 93% under 80%, 96% above that, and never above 92% on phones (under 640 px), always with a 24 px rise and a 640 ms ease. `data-motion-from="left|right"` makes a column slide in 32 px from its own side on screens 1024 px and wider (it only rises on phones, so nothing can push the page wider). Add `data-stagger` to a container whose children carry `data-motion` to cascade them 70 ms apart (lists do this automatically). `data-scroll-expand` (optionally the starting size, e.g. `0.86`; default 0.9, range 0.5 to 1) makes a large frame (figure, panel) start smaller and grow to full size as it scrolls up the screen, reaching exactly 100% once its top is 40% of the way down; it is driven by scroll position, not time, so never put `data-motion` on the same element. Photos inside an expanding frame still zoom: measurements compensate for the frame's own scale. `body { overflow-x: clip }` stops entrances from ever creating a horizontal scrollbar. Page changes use native cross-document view transitions (`@view-transition` in `tailwind.css`: a 180 ms fade out, a 420 ms settle in); the opt-in must stay outside any media query, and reduced motion switches the transition animations off in CSS instead. Browsers without support, and transitions the browser skips, are ordinary instant page loads. `npm run check:motion` covers all of this except the page transition, which only a real click in a real browser can show. Home photos (banner, statistics, About banner) are editable `image` page fields with built-in defaults registered in `src/config/pageImages.js`, resolved by `homePhoto` in `publicController.js`. The Home gallery section renders albums and the latest videos as one tile style (`partials/media-tiles.hbs`, fed by `buildMediaTiles`: up to two albums, then videos to fill three tiles; one, two or three tiles lay out as a feature row, two columns or three columns); video tiles link to `/gallery#videos` and never embed a player on Home. Reading the latest videos fails soft (`content.getHomeMedia`), so a video-read error hides the video tiles and never breaks Home. Home announcement cards come from `noticeCards`: a "New" flag for notices under 14 days old, and a one-paragraph teaser linking to `/announcements#notice-<id>` unless a lone notice is short enough to show in full. Cover the shaping rules with `node --test scripts/home-sections.test.js`.
- Static CSS and JS links in every layout use `?v={{assetVersion "/css/style.css"}}` (helper in `src/helpers/handlebars.js`): the Vercel deployment id in production, the file's modified time elsewhere. Never hand-write a `?v=` string, because browsers and Cloudflare cache these files for hours and a stale stylesheet beside new HTML breaks layouts. Add the same helper to any new asset link.

- Tutor access requests: visitors submit `/request-tutor-access` (`tutorRequestController`, editable page slug `tutor-request`, linked from login, curriculum and footer). Requests are `TutorRequest` rows; no account is created and nothing is emailed to the applicant. Honeypot, 5/hour/IP limit, a 500 pending cap, and identical responses for known emails (no enumeration); only the project mailbox is notified. Admins (`manageAccounts` only) review at `/admin/tutor-requests`: approve (atomic claim, creates an ACTIVE tutor with an unusable password and emails the invitation via `emailInvite`) or decline (no email). Verify with `node --test scripts/tutor-requests.test.js`.

- Tutor Portal sections are defined in `src/config/tutorSections.js`. `Document.portalSection` keeps Documents, Reports, and Plans and Activities separate from subject categories. Admin publishing uses `src/admin/documentResources.js`; new resources default to unpublished and tutor-only. Existing curriculum files remain in Documents. Portal content is editable through page configurations. Tutor routes require an active tutor/admin session; file downloads enforce audience and publication status. Tutor password changes use the shared account controller and form partial. There is no tutor upload or report-submission route.

- Tutor views use `layouts/tutor.hbs` and `partials/tutor/sidebar.hbs`. The sidebar is persistent at 1024 pixels and above; below that, `public/js/tutor.js` enhances it into a modal drawer with focus management, inert background, scroll lock and Escape/backdrop/X closing. Keep its `data-portal-*` handlers separate from public/admin menus. Without the portal script, navigation stays visible as a plain list. Verify with `node scripts/check-tutor-browser.js`.

- Admin views use `layouts/admin.hbs`: a navy sidebar from 1024 px up and, below that, a slide-in drawer (top bar + `data-admin-*` hooks, same focus management, `inert` background, scroll lock and Escape/backdrop/X closing as the Tutor Portal) enhanced by `public/js/admin.js`; without that script the navigation is a plain visible list. Row actions never appear as inline links: use `partials/admin/row-menu.hbs`, a native `<details>` "Actions" dropdown (`{{#> admin/row-menu label=name}}` with `role="menuitem"` links, or one-button POST forms carrying `_csrf`, plus `row-menu-sep` and the `row-menu-item-success` / `row-menu-item-danger` variants; icons from `admin/menu-icon`). `admin.js` positions the panel in the viewport (flipping upward near the bottom, so a scrolling table never clips it), handles arrow keys, Home/End, Escape (focus returns to the button), Tab-out and click-outside, and closes it on scroll or resize. Use `admin-table admin-table-stack` on list tables with `data-label` on each data cell, `admin-cell-title` on the first and `admin-cell-actions` on the last: under 640 px each row becomes a card. Initials in avatars come from `{{nameInitials name}}` (never name a helper after a property such as `initials`). Verify with `node --test scripts/admin-ui.test.js` and `node scripts/check-tutor-browser.js`.

- Public views get all editable content through `src/services/content.js` (reads the DB, cached 5 min; any admin POST clears the cache). Never put page copy in `.hbs` files.
- Page text: each page is a `PageContent` row by slug, with its editable fields defined (with defaults) in `src/config/pages.js`. Fields `title`/`summary`/`body` map to columns, everything else to `sections` JSON. Pages are edit-only in the admin (they match fixed routes). Text is plain; blank lines = paragraphs (`{{#each (paragraphs text)}}`).
- Page fields can be `type: 'image'` (e.g. Home → Banner photo), stored in `sections` as `{ url, publicId, width, height }`; `null` means "use the built-in default" (`pageImages.homeDefault`). `pagesController` keeps a saved photo when only text is edited and deletes the old file on replace/remove. The home page also shows the latest public announcements and albums automatically (sections hide when empty).
- Starter partners and activities are in `src/data/defaults.js`, inserted by `npm run db:seed` only when those tables are empty.
- Site-wide data (`site`, `partners`, `navigation`, `currentPath`) is set on `res.locals` by `src/middleware/siteLocals.js`.
- Navigation lives in `src/config/navigation.js` (single source for header, mobile menu and footer). The Project Activities dropdown is filled from published activities in the DB.
- Admin CRUD is config-driven: add/change a content type in `src/admin/resources.js` (fields, columns, hooks); `src/admin/crud.js` builds the routes, validation (`src/admin/fields.js`), uploads and file clean-up. Generic views: `admin/resource-list|form|delete.hbs`, fields rendered by `partials/admin/field.hbs`. Tutors, pages and the dashboard have their own controllers in `src/controllers/admin/`.
- Uploads: `src/middleware/upload.js` (multer, memory) + `src/services/storage.js` (Cloudinary; falls back to `public/uploads/` in development when Cloudinary keys are missing). Documents go to Cloudinary as `raw`. Use `{{img url "w_400,c_fill"}}` for Cloudinary transformations.
- Documents are private: stored as Cloudinary `authenticated` raw files (locally in `uploads/`, not `public/`). Never link `fileUrl`; always link `/documents/:id/download`, which checks audience/published/role and redirects to a 10-minute signed link.
- Public controllers call `setPageSeo` from `src/services/seo.js`; the shared `partials/seo-head.hbs` renders editable titles/descriptions, canonical URLs, social previews and safely escaped JSON-LD. `src/middleware/seo.js` excludes private routes and nonproduction deployments and permanently redirects public case/trailing-slash variants and announcements `?page=1` URLs. `seoController` serves robots and the published-content sitemap before sessions. Keep previews crawlable so search engines can read their `noindex` headers. See `docs/seo.md` and run `npm run check:seo` plus `node scripts/check-seo.js`.
- Hosting: Vercel. `api/index.js` exports the Express app as the serverless function; `vercel.json` rewrites all non-static requests to it, serves `public/` as static files, and bundles `src/views/**` and `public/images/**` into the function. `npm run vercel-build` builds and runs `prisma migrate deploy` for production deployments only (`scripts/migrate-production.js`). On Vercel (`process.env.VERCEL`): request bodies are capped at 4.5 MB by the platform, so uploads are limited to 4 MB per file and ~4.4 MB per form (checked in the browser via `data-max-upload-bytes`); the content cache TTL is 30 s; the pg pool is small. Never rely on in-memory state being shared between requests.
- Production refuses to start without `APP_URL` (https) and a 32+ character `SESSION_SECRET` (`src/config/checkEnv.js`). Emailed links must always be built from `APP_URL`, never the Host header.
- Production uses `APP_URL=https://kubshcdss.com`, hosted on Vercel behind Cloudflare. The www address redirects to the main domain; HTTP redirects to HTTPS. Keep local development's localhost URL. Domain operations and the outstanding nameserver confirmation are documented in `docs/domain-setup.md`; `check-motion-browser.js --live` targets the custom domain and verifies contact links after Cloudflare email decoding.
- Multipart forms put the CSRF token in the query string (`action="...?_csrf={{csrfToken}}"`) because the body isn't parsed until multer runs.
- Page banners with photos use `partials/photo-hero.hbs` (About, Contact). Photos are registered in `src/config/pageImages.js` (srcset, fallback, alt, per-breakpoint `object-position` so people stay in frame); optimised copies live in `public/images/pages/`, originals in `public/images/` are excluded from deploys via `.vercelignore`. Never upscale beyond the original's width.
- Footer partners strip (`partials/site-footer.hbs` + `partials/partner-tile.hbs`, data from `buildPartnerMarquee` in `siteLocals`): a CSS-only right-to-left loop of two identical groups (`translateX(-50%)`). Repeats are `aria-hidden`/`tabindex="-1"` so each partner is announced and tabbable once; it pauses on hover, keyboard focus and via the Pause button (JS), and is a still row under `prefers-reduced-motion`. Default partner logos are static files in `public/images/partners/` (no Cloudinary public ID).
- Handlebars partial blocks: never test `{{#if @partial-block}}`, because Handlebars reports it missing when the block's content is only an `{{#if}}…{{/if}}`. Callers pass an explicit flag instead (`actions=true` on `photo-hero` and `admin/page-header`). Inside a partial block, read page data via `@root` (e.g. `@root.site.contact.phone`).
- Never name a Handlebars helper after a common property (e.g. `label`, `title`, `name`): helpers shadow properties in `{{...}}`.
- Videos: `src/services/video.js` validates YouTube, Vimeo and public Cloudinary video URLs. It normalises external embeds, derives MP4 playback and poster URLs, and formats recorded duration. `Video.videoPublicId` identifies managed assets; external links have no owned asset. Cleanup runs after a successful database change.
- Tutors never get a password from an admin: creating/approving an account emails a single-use "choose your password" link (`src/services/passwordTokens.js`, valid 3 days). Email settings are validated in `src/config/email.js`; the shared mailer requires SMTP in every environment, bounds timeouts, checks recipient acceptance and logs only safe error codes. Templates are in `src/services/emailTemplates.js`. Account links use APP_URL, never the request Host. Verify with `npm run check:email` and `npm run check:email:connection`; production setup and Gmail sender authorization are in `docs/email.md`.
- Logo: master artwork is `public/images/brand/logo-original.jpg` (a JPEG, full lockup on pure black). Generated assets in `public/images/brand/`: `logo-lockup-*` (cropped full lockup, still on black, used in the header's black identity band via `<picture>`), `logo-emblem-*` (seal cut out as a transparent circle: footer, admin sidebar, home banner), favicons, `apple-touch-icon.png`, `og-image.jpg` (1200x630 default share image). Never chroma-key the black away: the flag swoosh has a black stripe. Paths come from `site.brand` (content service); without the brand folder the site falls back to `logo-placeholder.svg` and a text header.
- Desktop nav appears at the `xl` breakpoint; below that a sidebar menu (`partials/site-drawer.hbs`, opened by `partials/menu-button.hbs`) slides in from the right as a modal dialog: focus moves to the X and is trapped, Escape/backdrop/X/link close it, page scroll is locked (`html.drawer-locked`), and it closes when the screen widens to desktop. Menus work without JS (`no-js` class on `<html>`: the drawer renders as a plain list). Don't render sub-menus with the `hidden` attribute: Tailwind's base `[hidden]` rule is a layered `!important` that no fallback can override, so `site.js` collapses them on load instead. On phones the header logo is sized by width (`w-full max-w-70`), from `sm` up by height.
- Database: Prisma 7 with the `prisma-client-js` generator and the `@prisma/adapter-pg` driver adapter. Connection URLs are in `prisma.config.js`, not the schema (`DIRECT_URL` for migrations, pooled `DATABASE_URL` for the app). Prisma 7 requires Node 22.12+.
- `src/lib/db.js` exports one shared `pg` pool used by both Prisma and the session store. The `session` table is a Prisma model so migrations own it.
- Auth: `req.session.userId` only; `loadUser` sets `req.user` / `res.locals.currentUser` and logs out non-ACTIVE users. Protect content administration with `requireLogin` then `requirePermission('manageContent')`, account management with `requirePermission('manageAccounts')`, and the Tutor Portal with `requireRole('TUTOR', 'ADMIN')`. Do not infer account-management permission from content access.
- CSRF (csrf-sync): every POST form needs `<input type="hidden" name="_csrf" value="{{csrfToken}}">`. Add `provideCsrfToken` to GET routes with forms for anonymous users (logged-in users get a token automatically).
- Flash messages: `req.flash(type, message)` with type `success` | `error` | `info`, rendered by `{{> flash}}`.
- Buttons: `btn` plus a variant (`btn-primary`, `btn-green`, `btn-light`, `btn-outline-light`).

## Security checklist

- helmet with a CSP that allows only what's needed (Cloudinary, YouTube, Vimeo, fonts if used).
- CSRF token on every state-changing form.
- Validate and sanitise all input with express-validator; escape output (Handlebars `{{ }}`, avoid `{{{ }}}` unless content is sanitised).
- Rate-limit login, contact form and password-reset routes.
- Session cookies: `httpOnly`, `sameSite`, `secure` in production; regenerate session on login.
- Restrict upload file types and sizes in multer.
- Suspended tutors cannot log in.
