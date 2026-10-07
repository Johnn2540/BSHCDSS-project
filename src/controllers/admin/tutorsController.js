// Tutor account management: add, edit, approve, suspend, reactivate, resend invitation, delete.
// New tutors never get a password from the admin; they receive an emailed link to choose one.

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const createError = require('http-errors');
const { body } = require('express-validator');

const { prisma, pool } = require('../../lib/db');
const { collectErrors } = require('../../admin/fields');
const { sendInviteEmail } = require('../../services/passwordTokens');
const { logMailError } = require('../../services/mailer');
const { BCRYPT_ROUNDS } = require('../../config/auth');
const { permissionsFor } = require('../../services/permissions');

const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'];
const PER_PAGE = 25;

const rules = [
  body('name').trim().notEmpty().withMessage('Full name is required.').bail().isLength({ max: 120 }).withMessage('Full name must be 120 characters or fewer.'),
  body('email')
    .trim()
    .toLowerCase()
    .notEmpty()
    .withMessage('Email address is required.')
    .bail()
    .isEmail()
    .withMessage('Enter a valid email address.')
    .bail()
    .isLength({ max: 254 }),
  body('phone').trim().optional({ values: 'falsy' }).isLength({ max: 40 }).withMessage('Phone number must be 40 characters or fewer.'),
  body('institution').trim().optional({ values: 'falsy' }).isLength({ max: 150 }).withMessage('Institution must be 150 characters or fewer.'),
];
const createRules = [
  ...rules,
  body('status').isIn(['ACTIVE', 'PENDING']).withMessage('Choose whether to activate the account now.'),
];

async function findTutor(id) {
  const tutor = await prisma.user.findFirst({ where: { id, role: 'TUTOR' } });
  if (!tutor) throw createError(404, 'That tutor could not be found. The account may have been deleted.');
  return tutor;
}

const logOutEverywhere = (userId) => pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [userId]);

async function emailInvite(req, tutor) {
  try {
    await sendInviteEmail(req, tutor);
    return true;
  } catch (err) {
    logMailError('tutor invitation', err);
    req.flash('error', `The invitation email to ${tutor.email} could not be sent. Check the email settings, then use "Resend invitation".`);
    return false;
  }
}

function toData(input) {
  return {
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    institution: input.institution || null,
  };
}

async function emailTaken(email, excludeId) {
  const user = await prisma.user.findFirst({ where: { email, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  return Boolean(user);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function list(req, res) {
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = { role: 'TUTOR', ...(status ? { status } : {}) };

  const [grouped, total, tutors] = await Promise.all([
    prisma.user.groupBy({ by: ['status'], where: { role: 'TUTOR' }, _count: { _all: true } }),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: { id: true, name: true, email: true, institution: true, status: true, canManageContent: true, lastLoginAt: true, createdAt: true },
    }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabs = [
    { label: 'All', href: '/admin/tutors', count: all, active: !status },
    ...STATUSES.map((s) => ({
      label: s.charAt(0) + s.slice(1).toLowerCase(),
      href: `/admin/tutors?status=${s}`,
      count: counts[s] || 0,
      active: status === s,
    })),
  ];
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = status ? `status=${status}&` : '';

  res.render('admin/tutors/list', {
    title: 'Tutors',
    tutors,
    tabs,
    pagination:
      pages > 1
        ? {
            page,
            pages,
            prevHref: page > 1 ? `/admin/tutors?${qs}page=${page - 1}` : null,
            nextHref: page < pages ? `/admin/tutors?${qs}page=${page + 1}` : null,
          }
        : null,
  });
}

function newForm(req, res) {
  res.render('admin/tutors/form', { title: 'Add tutor', values: { status: 'ACTIVE' }, errors: {} });
}

async function create(req, res) {
  const errors = collectErrors(req);
  if (!errors.email && (await emailTaken(req.body.email))) errors.email = 'An account with this email address already exists.';
  if (Object.keys(errors).length) {
    return res.status(422).render('admin/tutors/form', { title: 'Add tutor', values: req.body, errors });
  }

  // Unusable random password until the tutor sets their own via the invitation link.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
  const tutor = await prisma.user.create({
    data: { ...toData(req.body), passwordHash, role: 'TUTOR', status: req.body.status },
  });

  if (tutor.status === 'ACTIVE') {
    const sent = await emailInvite(req, tutor);
    req.flash('success', sent ? `Tutor ${tutor.name} added. An invitation email has been sent to ${tutor.email}.` : `Tutor ${tutor.name} added.`);
  } else {
    req.flash('success', `Tutor ${tutor.name} added as pending. Approve the account when ready to send the invitation.`);
  }
  res.redirect('/admin/tutors');
}

async function editForm(req, res) {
  const tutor = await findTutor(req.params.id);
  res.render('admin/tutors/form', { title: 'Edit tutor', tutor, values: tutor, errors: {} });
}

async function update(req, res) {
  const tutor = await findTutor(req.params.id);
  const errors = collectErrors(req);
  if (!errors.email && (await emailTaken(req.body.email, tutor.id))) errors.email = 'Another account already uses this email address.';
  if (Object.keys(errors).length) {
    return res.status(422).render('admin/tutors/form', { title: 'Edit tutor', tutor, values: req.body, errors });
  }
  await prisma.user.update({ where: { id: tutor.id }, data: toData(req.body) });
  req.flash('success', `Tutor ${req.body.name} saved.`);
  res.redirect('/admin/tutors');
}

async function approve(req, res) {
  const tutor = await findTutor(req.params.id);
  if (tutor.status !== 'PENDING') {
    req.flash('error', `${tutor.name} is not awaiting approval.`);
    return res.redirect('/admin/tutors');
  }
  const updated = await prisma.user.update({ where: { id: tutor.id }, data: { status: 'ACTIVE' } });
  const sent = await emailInvite(req, updated);
  req.flash('success', `${tutor.name} approved.${sent ? ` An invitation email has been sent to ${tutor.email}.` : ''}`);
  res.redirect('/admin/tutors');
}

async function suspend(req, res) {
  const tutor = await findTutor(req.params.id);
  await prisma.user.update({ where: { id: tutor.id }, data: { status: 'SUSPENDED' } });
  await logOutEverywhere(tutor.id);
  req.flash('success', `${tutor.name} suspended and logged out. They can no longer log in.`);
  res.redirect('/admin/tutors');
}

async function reactivate(req, res) {
  const tutor = await findTutor(req.params.id);
  if (tutor.status !== 'SUSPENDED') {
    req.flash('error', `${tutor.name} is not suspended.`);
    return res.redirect('/admin/tutors');
  }
  await prisma.user.update({ where: { id: tutor.id }, data: { status: 'ACTIVE' } });
  req.flash('success', `${tutor.name} reactivated and can log in again.`);
  res.redirect('/admin/tutors');
}

async function setAdministrationAccess(req, res, enabled) {
  if (!permissionsFor(req.user).manageAccounts) throw createError(403, 'Only administrators can change administration access.');
  const tutor = await findTutor(req.params.id);
  if (enabled && tutor.status !== 'ACTIVE') throw createError(409, 'Approve or reactivate the tutor before promoting them.');

  // Recheck the target's role and status at the write, so a stale form cannot
  // change an administrator account or promote a concurrently suspended tutor.
  const result = await prisma.user.updateMany({
    where: { id: tutor.id, role: 'TUTOR', ...(enabled ? { status: 'ACTIVE' } : {}) },
    data: { canManageContent: enabled },
  });
  if (result.count !== 1) throw createError(409, 'The account changed. Reload the Tutors list and try again.');
  req.flash('success', enabled
    ? `${tutor.name} promoted to content administrator. They can manage site content but cannot manage accounts or permissions.`
    : `Administration access revoked for ${tutor.name}. They retain their tutor account.`);
  res.redirect('/admin/tutors');
}

const promote = (req, res) => setAdministrationAccess(req, res, true);
const demote = (req, res) => setAdministrationAccess(req, res, false);

async function resendInvite(req, res) {
  const tutor = await findTutor(req.params.id);
  if (tutor.status !== 'ACTIVE') {
    req.flash('error', 'Invitations can only be sent to active accounts. Approve or reactivate the account first.');
    return res.redirect('/admin/tutors');
  }
  if (await emailInvite(req, tutor)) req.flash('success', `Invitation sent to ${tutor.email}.`);
  res.redirect('/admin/tutors');
}

async function confirmDelete(req, res) {
  const tutor = await findTutor(req.params.id);
  res.render('admin/resource-delete', {
    title: 'Delete tutor',
    resource: { label: 'Tutors', singular: 'tutor', base: '/admin/tutors' },
    item: tutor,
    itemTitle: `${tutor.name} (${tutor.email})`,
    warning: 'The tutor will be logged out and their account permanently removed. To block access temporarily, suspend the account instead.',
  });
}

async function destroy(req, res) {
  const tutor = await findTutor(req.params.id);
  await logOutEverywhere(tutor.id);
  await prisma.user.delete({ where: { id: tutor.id } });
  req.flash('success', `Tutor ${tutor.name} deleted.`);
  res.redirect('/admin/tutors');
}

module.exports = {
  rules,
  createRules,
  list,
  newForm,
  create,
  editForm,
  update,
  approve,
  suspend,
  reactivate,
  promote,
  demote,
  resendInvite,
  confirmDelete,
  destroy,
};
