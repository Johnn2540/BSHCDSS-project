# Delegated administration

An administrator can promote an active tutor to **Content administrator** from **Admin > Tutors > Promote to content admin**. Use **Revoke admin access** on the same list to restore regular tutor access. The account keeps its tutor identity, login credentials and Tutor Portal access.

| Function | Administrator | Content administrator | Tutor |
| --- | --- | --- | --- |
| Edit pages, site settings and SEO | Yes | Yes | No |
| Manage team, activities, partners, announcements, albums and videos | Yes | Yes | No |
| Upload, edit, publish and delete documents, reports and plans | Yes | Yes | No |
| Download unpublished resources for review | Yes | Yes | No |
| Read published tutor resources and change own password | Yes | Yes | Yes |
| Add, edit, approve, suspend, reactivate or delete tutor accounts | Yes | No | No |
| Promote tutors or revoke administration access | Yes | No | No |

New and existing tutors have no administration access unless an administrator grants it. Pending and suspended accounts cannot be promoted. Suspension disables all account access; reactivation preserves any previously granted content access unless it was revoked separately.

Promotion does not assign the `ADMIN` role. It changes the `canManageContent` permission on a `TUTOR` account. Only active users with the original `ADMIN` role can manage accounts. Tutor-management endpoints cannot modify administrator accounts, including when an administrator ID is supplied directly.

`src/services/permissions.js` defines the permission policy. The server reloads the user and their permission from the database on each authenticated request. Revocation blocks subsequent content requests and stale form submissions in an existing session. Permissions are not taken from request parameters or stored in the session. The entire `/admin/tutors` subtree has an administrator-only guard, covering both page requests and direct POST requests. Promotion and revocation require POST and valid CSRF protection; the database write also rechecks the target's tutor role and, for promotion, active status.

Content administrators receive the content dashboard on login. Their sidebar and dashboard omit account controls and tutor account information. They can return to the Tutor Portal from the administration sidebar, and their portal links back to the administration dashboard.

## Deployment and verification

The additive migration `20261006020000_delegated_content_administration` adds a boolean column with a default of `false`. Apply it before running the updated application. Existing account roles, statuses and credentials are preserved. Production Vercel builds already regenerate Prisma and apply pending migrations.

Applied to the configured database on 6 October 2026. Verification confirmed the non-null column and false default, no granted tutor administration permissions, and continued account control for active administrators. The application was deployed to [kubshcdss.com](https://kubshcdss.com) the same day as [deployment dpl_Fx9xtciRbQBJ9ZPQGztMycSfqrEk](https://vercel.com/johnstone-s-projects/k-u-bshcdss-project/Fx9xtciRbQBJ9ZPQGztMycSfqrEk). Vercel confirmed production status **Ready**; database health, authentication forms, protected-route redirects, both domain redirects and SEO checks for all 11 public sitemap URLs passed. Promotion and revocation behavior passed the isolated permission suite before release.

For a separately managed environment:

```sh
npm run db:deploy
npm run build
npm run check:permissions
npm run check:tutor
npm run check:documents
```

Use the Node version required by `package.json` (22.12 or later, below 25). If Windows blocks test child processes with `spawn EPERM`, run each test file separately with `node --experimental-test-isolation=none --test scripts/admin-permissions.test.js`, and similarly for the tutor and document tests. Run fixture suites in separate Node processes because they replace module caches with isolated persistence.

The permission suite exercises real routes, CSRF, login sessions, content edits, draft downloads, forged account changes, administrator targets, inactive accounts, concurrent target changes and immediate revocation. It does not modify production accounts or send invitations.

The policy follows [OWASP's authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): enforce least privilege, deny access by default, validate permissions on every request and test authorization boundaries.
