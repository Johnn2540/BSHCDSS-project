// Generic admin CRUD router built from a resource definition (see src/admin/resources/).
//
// Routes (mounted at /admin/<key>):
//   GET  /              list (paginated)
//   GET  /new           create form
//   POST /              create
//   GET  /:id/edit      edit form
//   POST /:id           update
//   GET  /:id/delete    confirm delete
//   POST /:id/delete    delete (also removes stored files)

const express = require('express');
const createError = require('http-errors');
const { prisma } = require('../lib/db');
const { upload } = require('../middleware/upload');
const { uploadFile, destroyFile } = require('../services/storage');
const {
  isFileField,
  resolveOptions,
  fieldRules,
  collectErrors,
  toData,
  defaultValues,
  slugify,
} = require('./fields');

const PER_PAGE = 25;

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fileKind = (f) => (f.type === 'image' ? 'image' : 'document');

async function uniqueSlug(model, base, excludeId) {
  let slug = base;
  for (let n = 2; ; n += 1) {
    const clash = await model.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
    slug = `${base}-${n}`;
  }
}

function crudRouter(resource) {
  const router = express.Router();
  const model = prisma[resource.model];
  const base = `/admin/${resource.key}`;
  const fileFields = resource.fields.filter(isFileField);
  const slugField = resource.fields.find((f) => f.type === 'slug');
  const titleField = resource.titleField || 'title';
  const singular = resource.singular;

  const uploadMiddleware = fileFields.length
    ? upload(fileFields.map((f) => ({ name: f.name, kind: fileKind(f) })))
    : (req, res, next) => next();
  const rules = fieldRules(resource.fields);

  const view = { key: resource.key, label: resource.label, singular, base, intro: resource.intro };

  async function findOr404(id) {
    const item = await model.findUnique({ where: { id } });
    if (!item) throw createError(404, `That ${singular} could not be found. It may have been deleted.`);
    return item;
  }

  async function renderForm(req, res, { item = null, values, errors = {}, status = 200 }) {
    const fields = await Promise.all(
      resource.fields.map(async (f) => ({
        ...f,
        validate: undefined,
        options: f.type === 'select' ? await resolveOptions(f) : undefined,
        suggestions: typeof f.suggestions === 'function' ? await f.suggestions() : undefined,
        currentUrl:
          isFileField(f) && item && item[f.urlField] ? (f.downloadUrl ? f.downloadUrl(item) : item[f.urlField]) : null,
        currentName: isFileField(f) && item && f.meta && f.meta.fileName ? item[f.meta.fileName] : null,
      }))
    );
    const extras = item && resource.formExtras ? await resource.formExtras(item, req) : null;
    res.status(status).render('admin/resource-form', {
      title: item ? `Edit ${singular}` : `Add ${singular}`,
      resource: view,
      fields,
      item,
      itemTitle: item ? item[titleField] : null,
      values,
      errors,
      action: item ? `${base}/${item.id}` : base,
      hasUploads: fileFields.length > 0,
      extras,
    });
  }

  // Validates input and builds Prisma data. Returns { errors, data }.
  async function prepare(req, item) {
    const errors = collectErrors(req);
    const data = toData(resource.fields, req.body);

    for (const f of fileFields) {
      const hasNewFile = req.files && req.files[f.name] && req.files[f.name].length;
      if (f.required && !item && !hasNewFile && !errors[f.name]) errors[f.name] = `${f.label} is required.`;
    }

    if (slugField && !errors[slugField.name]) {
      if (data[slugField.name]) {
        const taken = await model.findFirst({
          where: { slug: data[slugField.name], ...(item ? { id: { not: item.id } } : {}) },
          select: { id: true },
        });
        if (taken) errors[slugField.name] = 'That web address is already used. Choose another.';
      } else {
        data[slugField.name] = await uniqueSlug(model, slugify(data[slugField.from || titleField]), item && item.id);
      }
    }

    if (resource.prepare && !Object.keys(errors).length) {
      Object.assign(errors, (await resource.prepare(data, { req, item })) || {});
    }
    return { errors, data };
  }

  // Uploads new files and returns { data, uploaded, replaced } where replaced lists old public IDs to delete.
  async function applyUploads(req, item) {
    const data = {};
    const uploaded = [];
    const replaced = [];
    try {
      for (const f of fileFields) {
        const file = req.files && req.files[f.name] && req.files[f.name][0];
        const oldPublicId = item ? item[f.publicIdField] : null;
        if (file) {
          const stored = await uploadFile(file, { folder: f.folder, kind: fileKind(f) });
          uploaded.push({ publicId: stored.publicId, kind: fileKind(f) });
          data[f.urlField] = stored.url;
          data[f.publicIdField] = stored.publicId;
          if (f.meta) {
            if (f.meta.fileName) data[f.meta.fileName] = file.originalname.slice(0, 200);
            if (f.meta.mimeType) data[f.meta.mimeType] = file.mimetype;
            if (f.meta.fileSize) data[f.meta.fileSize] = stored.bytes || file.size;
          }
          if (oldPublicId) replaced.push({ publicId: oldPublicId, kind: fileKind(f) });
        } else if (item && !f.required && req.body[`remove_${f.name}`] === 'on' && oldPublicId) {
          data[f.urlField] = null;
          data[f.publicIdField] = null;
          if (f.meta) Object.values(f.meta).forEach((col) => (data[col] = null));
          replaced.push({ publicId: oldPublicId, kind: fileKind(f) });
        }
      }
    } catch (err) {
      await Promise.all(uploaded.map((u) => destroyFile(u.publicId, u.kind)));
      throw err;
    }
    return { data, uploaded, replaced };
  }

  // Resource-specific extra routes (e.g. album photos) go first.
  if (resource.extraRoutes) resource.extraRoutes(router, { model, base, findOr404 });

  router.get('/', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const [total, items] = await Promise.all([
      model.count(),
      model.findMany({
        orderBy: resource.orderBy,
        include: resource.listInclude,
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
      }),
    ]);
    const columns = resource.columns.map((c) => ({ label: c.label, type: c.type || 'text' }));
    const rows = items.map((item) => ({
      id: item.id,
      title: item[titleField],
      cells: resource.columns.map((c) => ({
        type: c.type || 'text',
        value: c.value ? c.value(item) : item[c.field],
        isTitle: c.field === titleField,
      })),
    }));
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    res.render('admin/resource-list', {
      title: resource.label,
      resource: view,
      columns,
      rows,
      total,
      pagination: pages > 1 ? { page, pages, prev: page > 1 ? page - 1 : null, next: page < pages ? page + 1 : null } : null,
    });
  });

  router.get('/new', async (req, res) => {
    await renderForm(req, res, { values: defaultValues(resource.fields) });
  });

  router.post('/', uploadMiddleware, rules, async (req, res) => {
    const { errors, data } = await prepare(req, null);
    if (Object.keys(errors).length) {
      return renderForm(req, res, { values: req.body, errors, status: 422 });
    }
    const { data: fileData, uploaded } = await applyUploads(req, null);
    const extra = resource.beforeCreate ? resource.beforeCreate(req) : {};
    let created;
    try {
      created = await model.create({ data: { ...data, ...fileData, ...extra } });
    } catch (err) {
      await Promise.all(uploaded.map((u) => destroyFile(u.publicId, u.kind)));
      throw err;
    }
    req.flash('success', `${capitalise(singular)} "${created[titleField]}" created.`);
    res.redirect(resource.redirectAfterCreate ? `${base}/${created.id}/edit` : base);
  });

  router.get('/:id/edit', async (req, res) => {
    const item = await findOr404(req.params.id);
    await renderForm(req, res, { item, values: item });
  });

  router.post('/:id', uploadMiddleware, rules, async (req, res) => {
    const item = await findOr404(req.params.id);
    const { errors, data } = await prepare(req, item);
    if (Object.keys(errors).length) {
      return renderForm(req, res, { item, values: req.body, errors, status: 422 });
    }
    const { data: fileData, uploaded, replaced } = await applyUploads(req, item);
    try {
      await model.update({ where: { id: item.id }, data: { ...data, ...fileData } });
    } catch (err) {
      await Promise.all(uploaded.map((u) => destroyFile(u.publicId, u.kind)));
      throw err;
    }
    await Promise.all(replaced.map((r) => destroyFile(r.publicId, r.kind)));
    req.flash('success', `${capitalise(singular)} "${data[titleField] || item[titleField]}" saved.`);
    res.redirect(base);
  });

  router.get('/:id/delete', async (req, res) => {
    const item = await findOr404(req.params.id);
    const warning = resource.deleteWarning ? await resource.deleteWarning(item) : null;
    res.render('admin/resource-delete', {
      title: `Delete ${singular}`,
      resource: view,
      item,
      itemTitle: item[titleField],
      warning,
    });
  });

  router.post('/:id/delete', async (req, res) => {
    const item = await findOr404(req.params.id);
    // Files belonging to child records (e.g. an album's photos) are collected before deleting.
    const childFiles = resource.filesToDelete ? await resource.filesToDelete(item) : [];
    await model.delete({ where: { id: item.id } });
    const ownFiles = fileFields
      .filter((f) => item[f.publicIdField])
      .map((f) => ({ publicId: item[f.publicIdField], kind: fileKind(f) }));
    await Promise.all([...ownFiles, ...childFiles].map((f) => destroyFile(f.publicId, f.kind)));
    req.flash('success', `${capitalise(singular)} "${item[titleField]}" deleted.`);
    res.redirect(base);
  });

  return router;
}

module.exports = { crudRouter };
