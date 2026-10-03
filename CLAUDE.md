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
- **Tutor** — logs in to a dashboard with their profile, curriculum documents and announcements. **Read-only.**
- **Public visitors** — no login.

Enforce roles server-side with route middleware; never rely on hiding links in templates.

## Rules

- **No hard-coded content.** All page text, team members, documents, albums and videos come from the database and are editable from the admin panel. `.hbs` files contain layout and markup only. (Structural labels like nav items and form labels are fine in templates.)
- **Videos** are YouTube or Vimeo embeds (store the URL/ID, render a privacy-friendly embed). Never upload video files.
- **LMS page** (`/activities/lms`) is an information page with a link to an external LMS. Don't build an LMS.
- **No self-registration for admins.** The first admin is created via a seed script / CLI. Tutors are created or approved by an admin.
- **Mobile-first, accessible, fast on slow connections:**
  - Design for small screens first, then scale up.
  - Semantic HTML, landmarks, skip link, visible focus states, alt text on all images, labelled form fields.
  - Minimal JS, compressed/resized images via Cloudinary transformations, lazy-loaded images and embeds, cached static assets.

## Conventions

- Public views get all editable content through `src/services/content.js` (reads the DB, cached 5 min; any admin POST clears the cache). Never put page copy in `.hbs` files.
- Page text: each page is a `PageContent` row by slug, with its editable fields defined (with defaults) in `src/config/pages.js`. Fields `title`/`summary`/`body` map to columns, everything else to `sections` JSON. Pages are edit-only in the admin (they match fixed routes). Text is plain; blank lines = paragraphs (`{{#each (paragraphs text)}}`).
- Starter partners and activities are in `src/data/defaults.js`, inserted by `npm run db:seed` only when those tables are empty.
- Site-wide data (`site`, `partners`, `navigation`, `currentPath`) is set on `res.locals` by `src/middleware/siteLocals.js`.
- Navigation lives in `src/config/navigation.js` (single source for header, mobile menu and footer). The Project Activities dropdown is filled from published activities in the DB.
- Admin CRUD is config-driven: add/change a content type in `src/admin/resources.js` (fields, columns, hooks); `src/admin/crud.js` builds the routes, validation (`src/admin/fields.js`), uploads and file clean-up. Generic views: `admin/resource-list|form|delete.hbs`, fields rendered by `partials/admin/field.hbs`. Tutors, pages and the dashboard have their own controllers in `src/controllers/admin/`.
- Uploads: `src/middleware/upload.js` (multer, memory) + `src/services/storage.js` (Cloudinary; falls back to `public/uploads/` in development when Cloudinary keys are missing). Documents go to Cloudinary as `raw`. Use `{{img url "w_400,c_fill"}}` for Cloudinary transformations.
- Documents are private: stored as Cloudinary `authenticated` raw files (locally in `uploads/`, not `public/`). Never link `fileUrl`; always link `/documents/:id/download`, which checks audience/published/role and redirects to a 10-minute signed link.
- Public pages set `title`, `metaDescription` and optionally `metaImage` for the SEO/Open Graph tags in `layouts/main.hbs`; set `res.locals.noindex = true` for pages that shouldn't be indexed. `robots.txt` and `sitemap.xml` are generated in `publicController`.
- Hosting: Vercel. `api/index.js` exports the Express app as the serverless function; `vercel.json` rewrites all non-static requests to it, serves `public/` as static files, and bundles `src/views/**` and `public/images/**` into the function. `npm run vercel-build` builds and runs `prisma migrate deploy` for production deployments only (`scripts/migrate-production.js`). On Vercel (`process.env.VERCEL`): request bodies are capped at 4.5 MB by the platform, so uploads are limited to 4 MB per file and ~4.4 MB per form (checked in the browser via `data-max-upload-bytes`); the content cache TTL is 30 s; the pg pool is small. Never rely on in-memory state being shared between requests.
- Production refuses to start without `APP_URL` (https) and a 32+ character `SESSION_SECRET` (`src/config/checkEnv.js`). Emailed links must always be built from `APP_URL`, never the Host header.
- Multipart forms put the CSRF token in the query string (`action="...?_csrf={{csrfToken}}"`) because the body isn't parsed until multer runs.
- Page banners with photos use `partials/photo-hero.hbs` (About, Contact). Photos are registered in `src/config/pageImages.js` (srcset, fallback, alt, per-breakpoint `object-position` so people stay in frame); optimised copies live in `public/images/pages/`, originals in `public/images/` are excluded from deploys via `.vercelignore`. Never upscale beyond the original's width.
- Footer partners strip (`partials/site-footer.hbs` + `partials/partner-tile.hbs`, data from `buildPartnerMarquee` in `siteLocals`): a CSS-only right-to-left loop of two identical groups (`translateX(-50%)`). Repeats are `aria-hidden`/`tabindex="-1"` so each partner is announced and tabbable once; it pauses on hover, keyboard focus and via the Pause button (JS), and is a still row under `prefers-reduced-motion`. Default partner logos are static files in `public/images/partners/` (no Cloudinary public ID).
- Handlebars partial blocks: never test `{{#if @partial-block}}`, because Handlebars reports it missing when the block's content is only an `{{#if}}…{{/if}}`. Callers pass an explicit flag instead (`actions=true` on `photo-hero` and `admin/page-header`). Inside a partial block, read page data via `@root` (e.g. `@root.site.contact.phone`).
- Never name a Handlebars helper after a common property (e.g. `label`, `title`, `name`): helpers shadow properties in `{{...}}`.
- Videos: store only YouTube/Vimeo links; `src/services/video.js` normalises them to privacy-friendly embed URLs.
- Tutors never get a password from an admin: creating/approving an account emails a single-use "choose your password" link (`src/services/passwordTokens.js`, valid 3 days). Without SMTP in development, emails are printed to the console.
- Logo: master artwork is `public/images/brand/logo-original.jpg` (a JPEG, full lockup on pure black). Generated assets in `public/images/brand/`: `logo-lockup-*` (cropped full lockup, still on black, used in the header's black identity band via `<picture>`), `logo-emblem-*` (seal cut out as a transparent circle: footer, admin sidebar, home banner), favicons, `apple-touch-icon.png`, `og-image.jpg` (1200x630 default share image). Never chroma-key the black away: the flag swoosh has a black stripe. Paths come from `site.brand` (content service); without the brand folder the site falls back to `logo-placeholder.svg` and a text header.
- Desktop nav appears at the `xl` breakpoint; below that a sidebar menu (`partials/site-drawer.hbs`, opened by `partials/menu-button.hbs`) slides in from the right as a modal dialog: focus moves to the X and is trapped, Escape/backdrop/X/link close it, page scroll is locked (`html.drawer-locked`), and it closes when the screen widens to desktop. Menus work without JS (`no-js` class on `<html>`: the drawer renders as a plain list). Don't render sub-menus with the `hidden` attribute: Tailwind's base `[hidden]` rule is a layered `!important` that no fallback can override, so `site.js` collapses them on load instead. On phones the header logo is sized by width (`w-full max-w-70`), from `sm` up by height.
- Database: Prisma 7 with the `prisma-client-js` generator and the `@prisma/adapter-pg` driver adapter. Connection URLs are in `prisma.config.js`, not the schema (`DIRECT_URL` for migrations, pooled `DATABASE_URL` for the app). Prisma 7 requires Node 22.12+.
- `src/lib/db.js` exports one shared `pg` pool used by both Prisma and the session store. The `session` table is a Prisma model so migrations own it.
- Auth: `req.session.userId` only; `loadUser` sets `req.user` / `res.locals.currentUser` and logs out non-ACTIVE users. Protect routes with `requireLogin` then `requireRole(...)`.
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
