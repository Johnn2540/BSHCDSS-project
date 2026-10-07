// Reviewing visitors' requests for tutor access (administrators only: the whole /admin/tutor-requests subtree
// requires the manageAccounts permission). Approving a request creates the tutor account and emails the
// single-use "choose your password" invitation; nothing here ever sets or sees a password.

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const createError = require('http-errors');

const { prisma } = require('../../lib/db');
const { BCRYPT_ROUNDS } = require('../../config/auth');
const { emailInvite } = require('./tutorsController');

const BASE = '/admin/tutor-requests';
const STATUSES = ['PENDING', 'APPROVED', 'DECLINED'];
const PER_PAGE = 25;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

async function findRequest(id) {
  // Anything that is not an identifier of our own shape never reaches the database.
  const request = ID_PATTERN.test(String(id)) ? await prisma.tutorRequest.findUnique({ where: { id } }) : null;
  if (!request) throw createError(404, 'That request could not be found. It may have been deleted.');
  return request;
}

// Pending requests are the work to do, so they are the default tab; ?status=ALL shows everything.
async function list(req, res) {
  const requested = String(req.query.status || '');
  const status = STATUSES.includes(requested) ? requested : requested === 'ALL' ? null : 'PENDING';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = status ? { status } : {};

  const [grouped, total, requests] = await Promise.all([
    prisma.tutorRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.tutorRequest.count({ where }),
    prisma.tutorRequest.findMany({
      where,
      orderBy: [{ createdAt: status === 'PENDING' ? 'asc' : 'desc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: { id: true, name: true, email: true, phone: true, institution: true, message: true, status: true, createdAt: true, reviewedAt: true, reviewedBy: true },
    }),
  ]);

  const counts = Object.fromEntries(grouped.map((group) => [group.status, group._count._all]));
  const all = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const tabs = [
    { label: 'Pending', href: BASE, count: counts.PENDING || 0, active: status === 'PENDING' },
    { label: 'Approved', href: `${BASE}?status=APPROVED`, count: counts.APPROVED || 0, active: status === 'APPROVED' },
    { label: 'Declined', href: `${BASE}?status=DECLINED`, count: counts.DECLINED || 0, active: status === 'DECLINED' },
    { label: 'All', href: `${BASE}?status=ALL`, count: all, active: status === null },
  ];
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const query = status === 'PENDING' ? '' : `status=${status || 'ALL'}&`;

  res.render('admin/tutor-requests/list', {
    title: 'Tutor requests',
    requests,
    tabs,
    viewingPending: status === 'PENDING',
    pagination: pages > 1
      ? {
          page,
          pages,
          prevHref: page > 1 ? `${BASE}?${query}page=${page - 1}` : null,
          nextHref: page < pages ? `${BASE}?${query}page=${page + 1}` : null,
        }
      : null,
  });
}

async function show(req, res) {
  const request = await findRequest(req.params.id);
  // Link to the account only while it still exists.
  const account = request.approvedUserId
    ? await prisma.user.findFirst({ where: { id: request.approvedUserId, role: 'TUTOR' }, select: { id: true } })
    : null;
  res.render('admin/tutor-requests/show', { title: 'Tutor request', request, account });
}

// Approving is a two-step decision: the administrator must say, explicitly, whether the invitation email is sent.
async function confirmApprove(req, res) {
  const request = await findRequest(req.params.id);
  if (request.status !== 'PENDING') {
    req.flash('error', `The request from ${request.name} has already been reviewed.`);
    return res.redirect(BASE);
  }
  res.render('admin/tutor-requests/approve', { title: 'Approve tutor request', request });
}

async function approve(req, res) {
  const request = await findRequest(req.params.id);
  if (request.status !== 'PENDING') {
    req.flash('error', `The request from ${request.name} has already been reviewed.`);
    return res.redirect(BASE);
  }
  // Nothing is assumed: without an explicit yes or no the request stays pending and the question is asked again.
  const choice = typeof req.body.sendInvite === 'string' ? req.body.sendInvite : '';
  if (choice !== 'yes' && choice !== 'no') {
    req.flash('error', 'Choose whether to send the invitation email before approving.');
    return res.redirect(`${BASE}/${request.id}/approve`);
  }
  if (await prisma.user.findFirst({ where: { email: request.email }, select: { id: true } })) {
    req.flash('error', `An account with the email address ${request.email} already exists, so this request cannot be approved. Decline it, or find the account on the Tutors page.`);
    return res.redirect(`${BASE}/${request.id}`);
  }

  // Claim the request first: of two administrators acting at once, only one gets past this point.
  const claim = await prisma.tutorRequest.updateMany({
    where: { id: request.id, status: 'PENDING' },
    data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: req.user.name },
  });
  if (claim.count !== 1) {
    req.flash('error', `The request from ${request.name} was reviewed by someone else just now.`);
    return res.redirect(BASE);
  }

  let tutor;
  try {
    // An unusable random password until the tutor chooses their own through the emailed link.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
    tutor = await prisma.user.create({
      data: { name: request.name, email: request.email, phone: request.phone, institution: request.institution, passwordHash, role: 'TUTOR', status: 'ACTIVE' },
    });
  } catch (error) {
    // Release the claim so the request can be reviewed again.
    await prisma.tutorRequest.updateMany({
      where: { id: request.id, status: 'APPROVED', approvedUserId: null },
      data: { status: 'PENDING', reviewedAt: null, reviewedBy: null },
    });
    if (error && error.code === 'P2002') {
      req.flash('error', `An account with the email address ${request.email} already exists, so this request cannot be approved.`);
      return res.redirect(`${BASE}/${request.id}`);
    }
    throw error;
  }

  try {
    await prisma.tutorRequest.update({ where: { id: request.id }, data: { approvedUserId: tutor.id } });
  } catch (error) {
    // The account and the approval are saved; only the convenience link back to the account is missing.
    console.error('[tutor requests] could not link the approved account to its request');
  }

  if (choice === 'no') {
    req.flash('success', `${tutor.name} approved and their tutor account created. No invitation email was sent: use "Resend invitation" on the Tutors page when you are ready.`);
    return res.redirect(BASE);
  }
  const sent = await emailInvite(req, tutor);
  req.flash('success', `${tutor.name} approved and their tutor account created.${sent ? ` An invitation email with a link to choose a password has been sent to ${tutor.email}.` : ' Use "Resend invitation" on the Tutors page once email is working.'}`);
  res.redirect(BASE);
}

async function decline(req, res) {
  const request = await findRequest(req.params.id);
  const result = await prisma.tutorRequest.updateMany({
    where: { id: request.id, status: 'PENDING' },
    data: { status: 'DECLINED', reviewedAt: new Date(), reviewedBy: req.user.name },
  });
  if (result.count !== 1) req.flash('error', `The request from ${request.name} has already been reviewed.`);
  else req.flash('success', `The request from ${request.name} was declined. No email was sent and no account was created.`);
  res.redirect(BASE);
}

async function confirmDelete(req, res) {
  const request = await findRequest(req.params.id);
  res.render('admin/resource-delete', {
    title: 'Delete tutor request',
    resource: { label: 'Tutor requests', singular: 'tutor request', base: BASE },
    item: request,
    itemTitle: `${request.name} (${request.email})`,
    warning: request.status === 'APPROVED' ? 'The tutor account that was created from this request is not affected.' : null,
  });
}

async function destroy(req, res) {
  const request = await findRequest(req.params.id);
  await prisma.tutorRequest.delete({ where: { id: request.id } });
  req.flash('success', `The request from ${request.name} was deleted.`);
  res.redirect(BASE);
}

module.exports = { list, show, confirmApprove, approve, decline, confirmDelete, destroy };
