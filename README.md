# BSHCDSS-project

Production website: [kubshcdss.com](https://kubshcdss.com). Vercel hosts the application behind Cloudflare; `www.kubshcdss.com` redirects to the main address. Production uses `APP_URL=https://kubshcdss.com`; local development keeps its localhost URL. See [domain setup and verification](docs/domain-setup.md) for the hosting configuration and the outstanding nameserver confirmation.

The public navbar always shows a notification bell and a new-count badge, including zero. Publish notices in **Admin > Announcements** with audience **Public** to display them in the bell, on the homepage and at `/announcements`. Drafts, future-dated notices and tutor-only announcements are excluded. The panel displays the latest 20 notices; the announcements page provides pagination, and counts include all published public notices.

Visitors can expand notices and use **Mark all as read**. The read timestamp is saved in that browser and shared across its tabs; publishing or editing a notice makes it new again. Counts refresh every minute while the page is visible and when opening the panel. The read-only JSON endpoint does not create sessions. Notifications use a 30-second content cache, invalidated after admin changes. Without JavaScript or modal support, the bell opens the announcements page. Run `npm run check:notifications` and `npm run check:notifications:browser` to verify publication filtering, counts, responsive layout, keyboard navigation and read-state persistence using isolated fixtures.

Curriculum resources are managed through **Admin > Documents**.

The supplied collection contains 13 subject curriculum designs and the Master Trainers Training of Trainers manual. Original Word files are kept in `documents/Collection of Curriculum Designs in Different Subject Areas/`, outside the web root.

To validate or import the collection using the database and storage settings in `.env`:

```sh
node scripts/import-curriculum-documents.js --dry-run
npm run documents:import
```

The import preserves existing documents and admin edits when run again. New records are published for public access; an administrator can change their audience or publication status. Files use authenticated Cloudinary storage when configured and private local storage in development.

Visitors can search and filter the collection at `/curriculum`. The trainer manual also appears on the In-Service Teacher Training and CPD pages. The tutor dashboard includes all published public and tutor resources.

```sh
npm run build:css
npm run check:documents
```

Project profiles are managed through **Admin > Team members** and published at `/team`. The supplied K-1 to K-10 personnel appear in order, with K-1 featured as team leader. Profiles with no team reference appear under project administration and support. Admins can edit names, roles, contacts, biographies, order and publication status, and upload, replace or remove a portrait at any time.

Public pages, activities and albums have editable SEO titles and descriptions, canonical links, social previews and safe JSON-LD structured data. The sitemap tracks relevant published content updates; private pages and previews are excluded from indexing. See [SEO setup](docs/seo.md) for Google Search Console verification, sitemap submission and checks.

Email and WhatsApp icons link directly to the saved contact details. The optional **WhatsApp number** field requires an international number with its country code (for example, `+254 715 330094`); clear it to hide the link. A mobile number alone does not enable WhatsApp.

Portraits use the configured Cloudinary account, with responsive sizes, automatic format and quality, and face-centred square cropping. JPG, PNG and WebP files are supported. Until a portrait is uploaded, a profile displays initials. A replacement is saved before the previous Cloudinary asset is removed; failed uploads preserve the current portrait.

For a new environment, apply database migrations before importing the supplied roster:

```sh
npm run db:deploy
node scripts/import-project-team.js --dry-run
npm run team:import
```

The roster import updates the supplied names, roles, references and publication order while retaining existing biographies, institutions and portraits. It retains the lead's existing profile and adds the supplied lead contacts. Use the admin panel for subsequent edits; running the import again reapplies the supplied roster. To move existing `/images/team/` portraits to Cloudinary while keeping the original files, run `node scripts/import-project-team.js --migrate-portraits`.

```sh
npm run check:team
node scripts/check-team-browser.js
```

The browser check uses installed Chrome on Windows and validates the imported roster at 320, 390, 768 and 1440 pixels, including portrait delivery and admin login protection. Screenshots are saved in `.artifacts/`.

Videos appear at `/gallery#videos` and are managed through **Admin > Videos**. YouTube and Vimeo links use players that load when clicked. Cloudinary video links use native browser controls, a generated poster and `preload="none"`. Uploaded assets retain their dimensions and duration so portrait clips stay in frame.

The supplied `public/Videos/video.mp4` is imported into Cloudinary with an editable title and description. Its original file stays in the project and is excluded from Vercel deployments. Apply database migrations before importing into a new environment:

```sh
npm run db:deploy
npm run videos:import
npm run check:videos
node scripts/check-video-browser.js
```

Repeating the import preserves existing records and admin edits. Admins can edit the title, description, linked activity, date, order, video link and publication status. Replacing a managed video with a different source or deleting its record removes the old Cloudinary asset only after the database change succeeds. Delivery URL changes for the same asset retain its ownership and metadata. Pasted external video links are not treated as owned assets.

When adding a video provider, deploy the updated schema, generated Prisma client and player support before publishing records that use it. A previous deployment cannot decode an enum value introduced by a newer client. Vercel builds regenerate the client and apply production migrations through `npm run vercel-build`. The home page queries published video counts separately from the gallery's video records; verify with `npm run check:home`.

Approved tutors use the portal at `/tutor`, with three shared sections:

- **Documents:** `/tutor/documents`, managed in **Admin > Documents**.
- **Reports:** `/tutor/reports`, managed in **Admin > Reports**.
- **Plans and Activities:** `/tutor/plans-and-activities`, managed in **Admin > Plans and Activities**.

Each section supports category browsing, keyword search and authorized file downloads. Administrators upload, edit, replace, move, publish or unpublish resources. New files default to drafts with access restricted to approved tutors. Choosing a different portal section moves the resource while preserving its file. Existing curriculum documents retain their publication status and audience in Documents; reports and plans are not mixed into the public curriculum library. All file delivery continues through the protected download route and authenticated Cloudinary storage.

Portal headings, introductions, help text and empty-state messages are editable in **Admin > Page content**. Tutors can change their own passwords at `/tutor/password` after confirming their current password. Tutor resources are read-only; there is no tutor upload or report-submission permission. Administrators can preview the published portal. Authenticated and authentication pages use `Cache-Control: private, no-store`.

The portal uses its own workspace layout: a persistent sidebar on desktop and a hamburger drawer below 1024 pixels. The drawer supports keyboard focus, Escape, backdrop closing and screen-size changes. Navigation remains available if JavaScript is disabled or the portal script cannot load.

The existing account policy uses individual administrator-created tutor accounts and emailed password-setup links. Approve pending tutors in **Admin > Tutors**; suspend accounts to revoke access. Contact messages, invitations and password recovery share validated SMTP settings, bounded timeouts, checked recipient acceptance and HTML/plain-text templates. See [email configuration and production activation](docs/email.md). Run `npm run check:email` for isolated workflow tests and `npm run check:email:connection` to verify SMTP without sending. The additional MFA and recovery-hardening proposals in `docs/authentication-review.md` remain separate work.

```sh
npm run db:deploy
npm run check:tutor
node scripts/check-tutor-browser.js
```

The portal tests use isolated fake persistence, test accounts and file storage. The browser check uses installed Chrome and verifies layouts at 320, 390, 768, 1024 and 1440 pixels, drawer focus and closing, search, empty states, reduced motion and navigation without JavaScript. It does not create accounts or upload files to production.

Site motion uses the separate, optional `public/js/motion.js` and the motion styles in `src/styles/tailwind.css`. Headings and selected content cards enter once as they reach the viewport; content is visible before the script loads and when it is unavailable. Entrances use opacity and transforms without changing layout dimensions. Keyboard focus cancels an active entrance immediately. Forms, document rows and native video controls are kept outside moving containers. Auth/admin headings use a short fade, and card hover movement is limited to devices with a fine pointer.

Reduced-motion preferences disable entrances, CSS animations and transitions, including changes to the preference while the page is open. Printing and hiding the page cancel active entrances. The existing partner strip remains pausable and becomes static with reduced motion. Navigation, form submission, media controls, account actions and file delivery continue to use their existing handlers.

Run `npm run check:motion` for local public-page browser checks, or `node scripts/check-motion-browser.js --live` against production. `--interactions-only` checks menus, search, password controls, native media, reduced motion and fallbacks without repeating the four-width page comparisons. Run `node scripts/check-tutor-browser.js` for the isolated tutor/admin checks. Browser checks require installed Chrome; public-page checks read the configured database and do not submit contact or recovery forms.
