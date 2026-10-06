# Website email

Contact messages, tutor invitations and password recovery use the same SMTP service. Each message has a plain-text and an HTML version. Contact messages go to `CONTACT_EMAIL`, falling back to the editable site contact address; replies go to the visitor who submitted the form. Account emails go only to the account owner.

## Gmail configuration

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-authorized-sender@gmail.com
SMTP_PASS=your-google-app-password
MAIL_FROM="BSHCDSS <kussdproject@gmail.com>"
CONTACT_EMAIL=kussdproject@gmail.com
```

To preserve `kussdproject@gmail.com` as the sender, authenticate with that account and its own app password, or verify it under **Send mail as** in the authenticated Gmail account. A different, unverified `MAIL_FROM` can be replaced by Gmail with the authenticated account's address. Confirm the actual From header in a received test message. See [Google's alias setup](https://support.google.com/mail/answer/22370?hl=en) and [Nodemailer's Gmail guidance](https://nodemailer.com/guides/using-gmail).

Google app passwords require [2-Step Verification](https://support.google.com/accounts/answer/185833?hl=en). Save credentials directly in the ignored `.env` file, without committing or posting them. The application removes Google's formatting spaces from Gmail app passwords; other providers' passwords are preserved exactly.

Port 587 uses STARTTLS with `SMTP_SECURE=false`; the application requires the TLS upgrade. Port 465 uses immediate TLS with `SMTP_SECURE=true`. Connection, greeting and socket timeouts are bounded so a missing SMTP response cannot hold a website request open for Nodemailer's long defaults. Missing or invalid configuration makes sending fail rather than claiming that an email was delivered.

## Production activation

Local `.env` settings do not configure Vercel. Add the seven email variables above to this project's **Production** environment and deploy the tested changes. Keep production `APP_URL=https://kubshcdss.com`; retain the localhost URL in local development. Invitation and reset links use the configured application origin and never the incoming Host header.

Vercel applies changed environment variables only to a new deployment. Review [Vercel's environment-variable guidance](https://vercel.com/docs/environment-variables). Keep credentials scoped to this project and store `SMTP_PASS` as a secret. Production builds verify SMTP connection, TLS and authentication before applying database migrations; invalid email settings stop that deployment. Preview builds skip this network check. Preview environments should use controlled test accounts before exercising email workflows.

After deployment, verify the contact form and an invitation/password reset using controlled test accounts. Creating real invitations or requesting recovery for real users changes their tokens and sends messages; the automated tests use fake accounts and fake SMTP instead.

## Verification and failures

```sh
npm run check:email
npm run check:email:connection
```

The first command covers SMTP failures, HTML escaping, contact Reply-To, recovery privacy, invitation handling and working single-use links using isolated fixtures. The second checks real DNS, connection, TLS and SMTP authentication without sending a message or modifying accounts. It reports the Gmail alias requirement when the requested sender differs from the login. SMTP authentication and recipient acceptance do not prove inbox delivery or the final From header.

Contact delivery failures preserve the submitted message and show the project inbox as an alternative. Administrators see invitation failures and can use **Resend invitation**. Recovery responses remain the same for active, unknown, pending and suspended accounts. Known SMTP rejections remove only the failed request's token; uncertain timeouts retain its link because the message might have been accepted. No automatic retry follows an ambiguous delivery failure, avoiding duplicate messages.

Operational error logs contain SMTP error codes and numeric response codes, without passwords, provider responses, message bodies or recovery tokens. Sending requires configured SMTP in development too; there is no console-only fake success.

On 6 October 2026, the updated shared mailer passed local and Vercel production Gmail connection/TLS/authentication checks. The settings were synchronized to the existing Vercel email variables, preserving their production/preview scopes, and production APP_URL was set to `https://kubshcdss.com`. Deployment `dpl_HnkuBK98RmufqhupMDFQNCKrJdMQ` was staged, checked, and promoted to the custom domain. The domain assignment, database health and eight public/authentication page checks passed. All 19 email tests and 28 related regression tests passed. No real account tokens or user passwords were changed during verification. The actual project sender alias and inbox delivery remain account-side checks; SMTP verification alone does not establish them.
