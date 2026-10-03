// Page content editing. Pages are fixed (they match the site's routes), so they can be
// edited but not created or deleted. Field definitions live in src/config/pages.js.

const createError = require('http-errors');
const { prisma } = require('../../lib/db');
const pageConfigs = require('../../config/pages');
const content = require('../../services/content');
const { fieldRules, collectErrors, toData } = require('../../admin/fields');

const rulesBySlug = Object.fromEntries(pageConfigs.map((p) => [p.slug, fieldRules(p.fields)]));

function configOr404(slug) {
  const config = content.getPageConfig(slug);
  if (!config) throw createError(404, 'That page could not be found.');
  return config;
}

// Runs the validation rules for the page named in the URL.
async function validate(req, res, next) {
  const config = configOr404(req.params.slug);
  await Promise.all(rulesBySlug[config.slug].map((rule) => rule.run(req)));
  next();
}

async function list(req, res) {
  const rows = await prisma.pageContent.findMany({ select: { slug: true, updatedAt: true } });
  const updated = Object.fromEntries(rows.map((r) => [r.slug, r.updatedAt]));
  const pages = pageConfigs.map((p) => ({
    slug: p.slug,
    label: p.label,
    description: p.description,
    updatedAt: updated[p.slug] || null,
  }));
  res.render('admin/pages/list', { title: 'Page content', pages });
}

function renderForm(res, config, values, errors = {}, status = 200) {
  res.status(status).render('admin/pages/form', {
    title: `Edit: ${config.label}`,
    page: config,
    fields: config.fields,
    values,
    errors,
    action: `/admin/pages/${config.slug}`,
  });
}

async function editForm(req, res) {
  const config = configOr404(req.params.slug);
  const row = await prisma.pageContent.findUnique({ where: { slug: config.slug } });
  renderForm(res, config, content.rowToValues(config, row));
}

async function update(req, res) {
  const config = configOr404(req.params.slug);
  const errors = collectErrors(req);
  if (Object.keys(errors).length) return renderForm(res, config, req.body, errors, 422);

  const row = content.valuesToRow(config, toData(config.fields, req.body));
  await prisma.pageContent.upsert({
    where: { slug: config.slug },
    create: { slug: config.slug, ...row },
    update: row,
  });
  req.flash('success', `"${config.label}" saved.`);
  res.redirect('/admin/pages');
}

module.exports = { validate, list, editForm, update };
