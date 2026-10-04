# BSHCDSS authentication review and implementation proposal

Reviewed: 4 October 2026, Africa/Nairobi.

Recommended policy: administrator-approved tutor membership, with email invitations that let tutors set their own passwords. Keep account approval separate from proving control of an email address. A person who verifies an email address is not automatically an approved project tutor.

This is an authentication code and configuration review, with limited live checks. It is not a penetration-test certification or a claim that every website vulnerability has been identified. No live account, authentication policy or application code was changed during this review. No invitation or recovery email was sent.

## Account policy

| Option | Operational effect | Recommendation |
| --- | --- | --- |
| Administrator invitations from an approved roster | Strong control over eligibility; administrator must provision each member | Use for the initial tutor cohort. Add a previewed bulk roster import if necessary. |
| Public application followed by administrator approval | Tutors submit their details; staff verify eligibility before granting access | Add a **Request tutor access** form if unsolicited applications are part of the project. |
| Public signup with immediate access | Anybody with an email account gains tutor privileges | Avoid for project-restricted tutor resources. |

For invited tutors: administrator confirms the roster entry and email → creates an approved invitation → tutor opens an expiring email link → sets a password and confirms email possession → account becomes active → tutor signs in. Administrators never choose, see or send the tutor's password.

For access requests: applicant submits name, email and institution → verifies their email → staff compare the request with project eligibility criteria → staff approve or reject → an approved applicant receives an invitation. Submission and email verification confer no access. Collect only information needed for the eligibility decision. Do not accept an administrator role from a public form.

Administrators should have individual accounts provisioned through a controlled process, mandatory MFA, and a documented recovery process. Keep tutor invitations and administrator provisioning separate. Enabling MFA must not leave email-only recovery as a way to bypass it.

If the institutions already operate a common Microsoft Entra ID, Google Workspace or other supported identity provider, prefer institutional OIDC sign-in over adding another password for those users. The application must still enforce approved project membership and roles. A valid institutional login, email-domain match or consumer Google login alone does not establish tutor eligibility. For tutors across several institutions without a common identity service, invitations remain the practical starting point.

## Existing protections to retain

- PostgreSQL-backed sessions rather than browser storage of authentication credentials.
- Secure, HttpOnly, SameSite=Lax cookies on the live website; HTTPS, HSTS, CSP and no-referrer headers.
- CSRF checks on POST requests and server-side administrator/tutor role checks.
- Login session regeneration, generic invalid-credential responses, and a dummy bcrypt comparison for unknown accounts.
- bcrypt password hashes with a work factor of 12; plaintext passwords are not stored.
- Random 32-byte recovery tokens stored as SHA-256 hashes, with expiry checks. Current recovery validity is one hour; invitations are three days.
- Suspension checks on each authenticated request and session deletion on suspension/password reset.
- Server-side document audience checks and short-lived signed document download links.
- Administrator-created tutor accounts start with an unknown random password, so they cannot log in before setting their own password.

Public pages, existing public curriculum documents and media can remain public. Tutor membership protects the tutor dashboard and materials explicitly classified as tutor-only. Public team profiles are content records, not login accounts.

## Findings and priority

| Priority | Evidence | Required change |
| --- | --- | --- |
| Before onboarding | Current production deployment logs report `SMTP_HOST / MAIL_FROM not set`. Vercel lists email variable names, which does not establish usable values or delivery. `src/services/mailer.js` refuses to send without SMTP in production. | Configure approved email delivery and a valid sender. Keep `kussdproject@gmail.com` as the supplied contact address. Verify delivery of invitations, recovery and notifications to a controlled test mailbox. Monitor failures. If using an owned sender domain, configure SPF, DKIM and DMARC. |
| Before onboarding | `src/middleware/rateLimits.js` uses a per-process memory store and default IP keys. Vercel runs multiple function instances. | Use atomic shared counters across instances, with per-account and per-IP controls for login, recovery, applications and invitation resend. Use progressive delays and bounded temporary restrictions; avoid permanent lockout triggered by attackers. Account for tutors sharing school/mobile-network IPs. Verify proxy/IP handling in the deployed environment. |
| Before wider administrative use | The schema and auth routes contain no MFA enrollment, challenge or recovery mechanism. | Require a second factor for administrators. Prefer passkeys/security keys; an authenticator app with individually hashed recovery codes is a practical alternative. Authenticator codes can be generated offline. Offer tutor MFA and require it where resource sensitivity warrants it. Protect MFA changes with fresh authentication. |
| Before onboarding | `authController.reset()` checks the token before its transaction, then unconditionally updates the token by ID. An isolated mocked concurrency probe allowed two simultaneous requests to commit. This was not attempted against production. | Atomically claim an unexpired, unused token for the intended purpose and active user inside the password-update transaction. Require exactly one successful claim. Only one concurrent submission may succeed. Invalidate other applicable tokens. |
| Before onboarding | Password changes commit before separate SQL session deletion. `loadUser` checks status but has no credential/session version. | Add an account session version, recorded on login and checked on authenticated requests. Increment it transactionally on password reset, sensitive email changes and suspension. This prevents older sessions from becoming valid again through concurrent session writes. Keep explicit session cleanup. |
| Before onboarding | `tutorsController.update()` changes email directly without a verification step, token invalidation, notification or session revocation. | Treat email changes as sensitive operations: require fresh administrator authentication, retain a pending address until verified, invalidate relevant recovery/invitation tokens, revoke sessions on completion and notify the existing address. Define separately verified support recovery when the old mailbox is unavailable. |
| Before onboarding | Minimum password length is 10. Validation limits characters to 72, but bcrypt truncates after 72 bytes. An isolated probe showed two different 37-character Unicode passwords comparing equal at 73 bytes. | Use at least 15 characters for password-only accounts; allow passphrases, spaces, paste and password managers; reject common/compromised passwords. Prefer Argon2id for the revised system and migrate existing bcrypt hashes on successful authentication. If bcrypt is retained temporarily, validate UTF-8 byte length consistently and never silently truncate. |
| Before onboarding | Live login/recovery pages return `Cache-Control: public, max-age=0, must-revalidate`; sensitive pages have no explicit no-store middleware. Session cookies are correctly protected. | Set `Cache-Control: private, no-store` on auth forms, reset/invitation pages and authenticated HTML responses, including protected redirects. Retain the current no-referrer policy and avoid token-bearing analytics/log payloads. |
| Before onboarding | Recovery uses the same confirmation text for everyone, but existing active accounts perform token creation and wait for SMTP before responding. There is no successful-reset notification. | Use a durable email outbox/queue and comparable request-response paths so account existence is not exposed through timing. Keep generic responses and per-account throttling. Send a notification after a successful password change; do not include the password. Do not automatically log in after recovery. |
| Before onboarding | Change password exists only under `/admin/password`; the tutor router exposes only its dashboard. | Add an account/security page usable by tutors, with current-password verification, password change, session revocation, accessible errors and role-appropriate navigation. |
| Before onboarding | `rolling: true` renews an eight-hour session window, without a separate absolute expiry. | Enforce both idle and absolute session expiry on the server. A proposed starting policy is 20 minutes idle/8 hours absolute for administrators, and 60 minutes idle/8 hours absolute for tutors, adjusted to shared-device use and project requirements. Warn before expiry without exposing credentials. |
| Before onboarding | Only PENDING, ACTIVE and SUSPENDED statuses exist. Invitations are sent after marking the account ACTIVE; invitation and reset tokens share one table without a purpose field. | Represent approval and activation separately, such as pending review, invited, active and suspended. Record verification/activation timestamps and invitation delivery status. Distinguish invitation, reset and email-change token purposes. Keep failed delivery visible and safely retryable. Do not allow a reset to bypass approval or suspension. |
| Before wider use | No dedicated auth audit model or comprehensive auth test suite was found. | Record approval, invitation, activation, login failures, recovery, email changes, suspension and MFA changes without passwords or raw tokens. Add operational alerts and retention/access rules. Use named administrators and protect the last usable administrative account. |
| Deployment maintenance | Read-only `npm audit --omit=dev` reported four high-severity package entries in the Prisma dependency chain, including `deepmerge-ts` and `mysql2`. This project uses PostgreSQL, so a package advisory is not proof of an exploitable auth vulnerability. Production/preview database and session-secret settings appear as shared Vercel environment entries. | Review advisory reachability and apply tested compatible dependency fixes. Do not blindly run `npm audit fix --force`, whose proposed Prisma downgrade would affect this Prisma 7 app. Isolate preview/test databases and credentials from production before running account tests or migrations there. |

## Implementation order

1. Settle the membership policy and check whether the institutions have a common identity provider. Inventory administrator access and recovery contacts.
2. Make email delivery work, including a durable delivery/retry mechanism. Separate preview/test data from production.
3. Implement atomic token consumption, verified email changes, explicit activation state, session versioning, no-store responses and a consistent password policy.
4. Add shared rate limiting and administrator MFA with secure recovery. Add tutor account/security controls and auth auditing.
5. Improve the forms: **Log in**, **Forgot password**, **Accept invitation**, **Request tutor access** if applicable, and **Account and security**. Distinguish invitation acceptance from password recovery in headings and messages. Show expiry, resend/help options, accessible inline errors, keyboard support and loading/submission feedback. Do not advertise unrestricted signup when membership requires approval.
6. Validate in an isolated environment, then release to production and run a small controlled onboarding pilot before inviting the full roster.

## Acceptance checks before rollout

- An unapproved applicant cannot sign in or download tutor-only materials. Public form tampering cannot create an administrator or an active tutor.
- Tutors are blocked from every administrator route, including POST/upload endpoints; anonymous access is blocked appropriately.
- Invitation/recovery flows work with a controlled test mailbox; failed delivery and expired links have clear, safe retry paths.
- Expired, revoked, reused or wrong-purpose tokens fail. Two simultaneous uses of one token produce exactly one success. Token-bearing GET requests do not consume invitations, including email link-scanner visits.
- Password reset, email change and suspension revoke old sessions even under concurrent requests. Suspended users cannot recover around the suspension.
- Unknown and known accounts receive comparable recovery responses. Shared rate limits continue working across multiple instances without unnecessarily blocking an entire school.
- Password Unicode handling is correct; common/breached passwords are rejected; existing hashes migrate without excluding legitimate users.
- Administrator MFA enrollment, challenge, recovery, factor replacement and sensitive-action reauthentication are verified.
- Idle/absolute timeouts, CSRF, safe redirects, sensitive-page cache headers and logout work as intended.
- Live production email, database and sender configuration are verified without exposing secrets. Security logging excludes passwords, reset links and raw tokens.

## Evidence and guidance

Live GET checks confirmed: login/recovery pages render; signup/register return 404; administrator/tutor routes redirect unauthenticated visitors to login; invalid reset links render the invalid-link message; production cookie flags and security headers are present. Authenticated live workflows and actual email delivery were not exercised. The concurrency and Unicode probes used isolated mocked persistence and temporary data.

- [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): roles, MFA, sensitive email changes, throttling and monitoring.
- [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): generic responses, timing, secure tokens, notifications and session invalidation.
- [NIST SP 800-63B-4 password requirements](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver): 15-character minimum for passwords used alone, blocklists and support for long passphrases.
- [express-rate-limit store guidance](https://express-rate-limit.mintlify.app/overview): memory-store limitations with multiple instances.
- [bcrypt byte-limit documentation](https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns): the 72-byte truncation boundary.
- [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): Argon2id and migration of password hashing schemes.
- [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): expiry and sensitive-page caching.
