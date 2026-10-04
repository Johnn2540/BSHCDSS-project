// Page content editing. Pages are fixed (they match the site's routes), so they can be
// edited but not created or deleted. Field definitions live in src/config/pages.js.
// Image fields (e.g. the home banner photo) are uploaded to Cloudinary; a saved photo is kept
// when the page's text is edited, and only changes when it's replaced or removed.

const createError = require('http-errors');
const { prisma } = require('../../lib/db');
const pageConfigs = require('../../config/pages');
const content = require('../../services/content');
const { upload: uploadMiddleware } = require('../../middleware/upload');
const { uploadFile, destroyFile } = require('../../services/storage');
const { fieldRules, collectErrors, toData } = require('../../admin/fields');

const rulesBySlug = Object.fromEntries(pageConfigs.map((p) => [p.slug, fieldRules(p.fields)]));
const imageFieldsOf = (config) => config.fields.filter((f) => f.type === 'image');

// One multer handler for every image field on any page (multer ignores non-multipart forms).
const allImageFields = [...new Set(pageConfigs.flatMap((p) => imageFieldsOf(p).map((f) => f.name)))];
const upload = allImageFields.length
  ? uploadMiddleware(allImageFields.map((name) => ({ name, kind: 'image' })))
  : (req, res, next) => next();

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
  const fields = config.fields.map((f) =>
    f.type === 'image' ? { ...f, currentUrl: values[f.name] && values[f.name].url ? values[f.name].url : null } : f
  );
  res.status(status).render('admin/pages/form', {
    title: `Edit: ${config.label}`,
    page: config,
    fields,
    values,
    errors,
    action: `/admin/pages/${config.slug}`,
    hasUploads: imageFieldsOf(config).length > 0,
  });
}

async function loadValues(config) {
  const row = await prisma.pageContent.findUnique({ where: { slug: config.slug } });
  return content.rowToValues(config, row);
}

async function editForm(req, res) {
  const config = configOr404(req.params.slug);
  renderForm(res, config, await loadValues(config));
}

async function update(req, res) {
  const config = configOr404(req.params.slug);
  const current = await loadValues(config);
  const imageFields = imageFieldsOf(config);
  const errors = { ...collectErrors(req) };

  if (Object.keys(errors).length) {
    // Re-show the form with the typed text and the photos that are already saved.
    const values = { ...req.body };
    imageFields.forEach((f) => (values[f.name] = current[f.name]));
    return renderForm(res, config, values, errors, 422);
  }

  const data = toData(config.fields, req.body);
  const uploaded = [];
  const replaced = [];
  try {
    for (const f of imageFields) {
      const file = req.files && req.files[f.name] && req.files[f.name][0];
      const existing = current[f.name];
      if (file) {
        const stored = await uploadFile(file, { folder: f.folder || 'pages', kind: 'image' });
        uploaded.push(stored.publicId);
        data[f.name] = { url: stored.url, publicId: stored.publicId, width: stored.width, height: stored.height };
        if (existing && existing.publicId) replaced.push(existing.publicId);
      } else if (req.body[`remove_${f.name}`] === 'on') {
        data[f.name] = null; // back to the built-in default
        if (existing && existing.publicId) replaced.push(existing.publicId);
      } else {
        data[f.name] = existing || null; // keep the saved photo
      }
    }

    const row = content.valuesToRow(config, data);
    await prisma.pageContent.upsert({
      where: { slug: config.slug },
      create: { slug: config.slug, ...row },
      update: row,
    });
  } catch (err) {
    await Promise.all(uploaded.map((id) => destroyFile(id, 'image')));
    throw err;
  }
  await Promise.all(replaced.map((id) => destroyFile(id, 'image')));

  req.flash('success', `"${config.label}" saved.`);
  res.redirect('/admin/pages');
}

module.exports = { upload, validate, list, editForm, update };
