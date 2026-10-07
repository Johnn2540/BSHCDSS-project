// Public "request tutor access" form.
//
// A request holds no password and creates no account: it is stored for an administrator to review in
// Admin > Tutor requests, where approving it creates the account and emails the invitation.
//
// The response is identical whether or not the email already has an account or a pending request, so the form
// cannot be used to find out who is registered. Nothing is ever emailed to the address the visitor typed; the
// only message sent here goes to the project's own mailbox.

const { body } = require('express-validator');

const content = require('../services/content');
const { prisma } = require('../lib/db');
const { sendMail, logMailError } = require('../services/mailer');
const { tutorRequestEmail } = require('../services/emailTemplates');
const { emailOrigin } = require('../services/passwordTokens');
const { collectErrors } = require('../admin/fields');

const PATH = '/request-tutor-access';
// Each visitor may send one request. A cookie remembers it in this browser (the person sees a clear notice instead of
// the form), and an email address that has ever made a request is never accepted again, whatever its outcome.
const SENT_COOKIE = 'tutor_request_sent';
const SENT_COOKIE_DAYS = 90;
const hasSentBefore = (req) => /(?:^|;\s*)tutor_request_sent=1(?:;|$)/.test(req.headers.cookie || '');
function rememberSent(res) {
  res.cookie(SENT_COOKIE, '1', {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SENT_COOKIE_DAYS * 24 * 60 * 60 * 1000,
  });
}
const FIELDS = ['name', 'email', 'institution', 'phone', 'message', 'website'];
// A ceiling on unreviewed requests, so a flood of submissions cannot grow the table without limit.
const MAX_PENDING_REQUESTS = 500;

// Form fields arrive as strings; a repeated or bracketed field (name[]=…) would otherwise reach the validators as an array.
function onlyStrings(req, res, next) {
  req.body = req.body && typeof req.body === 'object' ? req.body : {};
  for (const field of FIELDS) if (typeof req.body[field] !== 'string') req.body[field] = '';
  next();
}

const rules = [
  onlyStrings,
  body('name').trim().notEmpty().withMessage('Enter your full name.').bail().isLength({ min: 2, max: 120 }).withMessage('Your name must be between 2 and 120 characters.'),
  body('email').trim().toLowerCase().notEmpty().withMessage('Enter your email address.').bail().isEmail().withMessage('Enter a valid email address.').bail().isLength({ max: 254 }).withMessage('Your email address must be 254 characters or fewer.'),
  body('institution').trim().notEmpty().withMessage('Tell us where you teach or work.').bail().isLength({ max: 150 }).withMessage('This must be 150 characters or fewer.'),
  body('phone').trim().optional({ values: 'falsy' }).matches(/^[+\d\s().-]{5,40}$/).withMessage('Enter a valid phone number, or leave it blank.'),
  body('message').trim().optional({ values: 'falsy' }).isLength({ max: 1000 }).withMessage('Your message must be 1,000 characters or fewer.'),
];

// Direct ways to reach the project team instead of the form: WhatsApp (when a number is set in Site settings) and email.
async function directContacts() {
  const site = await content.getSite();
  const note = 'Hello, I would like to request a tutor account on the BSHCDSS website.';
  const email = (site.contact.email || '').trim();
  return {
    whatsappUrl: site.contact.whatsappUrl ? `${site.contact.whatsappUrl}?text=${encodeURIComponent(note)}` : null,
    mailto: email ? `mailto:${email}?subject=${encodeURIComponent('Tutor access request')}&body=${encodeURIComponent(note)}` : null,
    email,
  };
}

async function render(req, res, { values = {}, errors = {}, status = 200, sent = false } = {}) {
  const page = await content.getPage('tutor-request');
  const direct = await directContacts();
  const alreadySent = !sent && hasSentBefore(req);
  // The form carries a CSRF token and, once sent, a confirmation: neither belongs in a shared cache.
  res.set('Cache-Control', 'private, no-store');
  res.status(status).render('public/tutor-request', { title: page.title, metaDescription: page.summary, page, values, errors, sent, alreadySent, direct });
}

// The confirmation replaces the form once, right after a submission (the flash message is read and cleared by the
// flash middleware), so reloading the page or following the link later shows the form again.
function showForm(req, res) {
  const sent = (res.locals.flash || []).some((message) => message.type === 'success');
  return render(req, res, { sent });
}

// Tells the project mailbox about a new request. The request is already saved, so a mail problem is logged and
// never shown to, or lost for, the visitor.
async function notifyAdministrator(request) {
  try {
    const site = await content.getSite();
    const to = (process.env.CONTACT_EMAIL || site.contact.email || '').trim();
    if (!to) return;
    let reviewUrl = null;
    try { reviewUrl = `${emailOrigin()}/admin/tutor-requests/${encodeURIComponent(request.id)}`; } catch { /* no usable APP_URL: send without a link */ }
    await sendMail({
      to,
      replyTo: { name: request.name.replace(/[\r\n]+/g, ' ').trim(), address: request.email },
      ...tutorRequestEmail({ siteName: site.shortName, ...request, reviewUrl }),
    });
  } catch (error) {
    logMailError('tutor access request notification', error);
  }
}

async function submit(req, res) {
  // Honeypot: real visitors never see or fill the "website" field. Bots get the same confirmation, and nothing is stored.
  if (req.body.website) {
    req.flash('success', 'sent');
    return res.redirect(PATH);
  }

  // One request per person: a browser that has already sent one gets the same notice the form page shows.
  if (hasSentBefore(req)) return res.redirect(PATH);

  const errors = collectErrors(req);
  if (Object.keys(errors).length) return render(req, res, { values: req.body, errors, status: 422 });

  const { name, email, institution, phone, message } = req.body;
  const [account, pending, pendingTotal] = await Promise.all([
    prisma.user.findFirst({ where: { email }, select: { id: true } }),
    prisma.tutorRequest.findFirst({ where: { email }, select: { id: true } }),
    prisma.tutorRequest.count({ where: { status: 'PENDING' } }),
  ]);

  // Existing accounts and emails that have already made a request are quietly ignored (see the note at the top of this file).
  if (!account && !pending && pendingTotal < MAX_PENDING_REQUESTS) {
    const request = await prisma.tutorRequest.create({
      data: { name, email, institution, phone: phone || null, message: message || null },
    });
    await notifyAdministrator(request);
  }

  rememberSent(res);
  req.flash('success', 'sent');
  res.redirect(PATH);
}

module.exports = { rules, showForm, submit, MAX_PENDING_REQUESTS };
