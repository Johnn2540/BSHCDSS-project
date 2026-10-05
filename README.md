# BSHCDSS-project

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

The existing account policy uses individual administrator-created tutor accounts and emailed password-setup links. Approve pending tutors in **Admin > Tutors**; suspend accounts to revoke access. Working SMTP credentials and a valid `MAIL_FROM` are required for invitation and recovery email. Email setup is pending at the user's request; configure it before inviting tutors. This portal release does not implement the additional MFA and recovery-hardening proposals in `docs/authentication-review.md`.

```sh
npm run db:deploy
npm run check:tutor
node scripts/check-tutor-browser.js
```

The portal tests use isolated fake persistence, test accounts and file storage. The browser check uses installed Chrome and verifies layouts at 320, 390, 768 and 1440 pixels, search, empty states and navigation without JavaScript. It does not create accounts or upload files to production.
