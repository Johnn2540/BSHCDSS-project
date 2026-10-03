// Field definitions -> express-validator rules, and form input -> Prisma data.
//
// Field options:
//   name, label, type, required, max, min, help, rows, default, placeholder
//   type: text | textarea | lines | email | url | slug | number | date | checkbox | select | image | file
//   select:  options: [{ value, label }] or async () => [{ value, label }]
//   slug:    from: 'title'  (generated from that field when left blank)
//   image/file: folder, urlField, publicIdField, meta: { fileName, mimeType, fileSize }
//   validate: (value, { req }) => true | throw Error   extra check for text-like fields

const { body, validationResult } = require('express-validator');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_MAX = { text: 200, email: 254, url: 500, slug: 100, textarea: 20000, lines: 5000 };

const isFileField = (f) => f.type === 'image' || f.type === 'file';

async function resolveOptions(field) {
  if (typeof field.options === 'function') return field.options();
  return field.options || [];
}

function fieldRules(fields) {
  return fields
    .filter((f) => !isFileField(f) && f.type !== 'checkbox')
    .map((f) => {
      const label = f.label;
      let c = body(f.name);

      if (f.type === 'number') {
        const min = f.min ?? 0;
        const max = f.max ?? 100000;
        return c
          .optional({ values: 'falsy' })
          .isInt({ min, max })
          .withMessage(`${label} must be a whole number between ${min} and ${max}.`);
      }

      if (f.type === 'date') {
        c = f.required ? c.notEmpty().withMessage(`${label} is required.`).bail() : c.optional({ values: 'falsy' });
        return c.isISO8601({ strict: true }).withMessage(`${label} must be a valid date.`);
      }

      if (f.type === 'select') {
        c = c.trim();
        c = f.required ? c.notEmpty().withMessage(`Choose ${label.toLowerCase()}.`).bail() : c.optional({ values: 'falsy' });
        return c.custom(async (value) => {
          const options = await resolveOptions(f);
          if (!options.some((o) => String(o.value) === value)) throw new Error(`Choose a valid ${label.toLowerCase()}.`);
          return true;
        });
      }

      // Text-like fields
      const max = f.max || DEFAULT_MAX[f.type] || 200;
      c = c.trim();
      c = f.required ? c.notEmpty().withMessage(`${label} is required.`).bail() : c.optional({ values: 'falsy' });
      c = c.isLength({ max }).withMessage(`${label} must be ${max} characters or fewer.`).bail();
      if (f.type === 'email') c = c.isEmail().withMessage('Enter a valid email address.').bail();
      if (f.type === 'url') {
        c = c
          .isURL({ protocols: ['http', 'https'], require_protocol: true })
          .withMessage(`${label} must be a full web address starting with https://`)
          .bail();
      }
      if (f.type === 'slug') c = c.matches(SLUG_RE).withMessage('Use lowercase letters, numbers and hyphens only.').bail();
      if (f.validate) c = c.custom(f.validate);
      return c;
    });
}

// First error message per field, merged with upload errors.
function collectErrors(req) {
  const errors = {};
  for (const err of validationResult(req).array()) {
    if (err.path && !errors[err.path]) errors[err.path] = err.msg;
  }
  return { ...errors, ...(req.uploadErrors || {}) };
}

function toData(fields, input) {
  const data = {};
  for (const f of fields) {
    if (isFileField(f)) continue;
    const v = input[f.name];
    switch (f.type) {
      case 'checkbox':
        data[f.name] = v === 'on' || v === 'true' || v === '1';
        break;
      case 'number':
        data[f.name] = v === '' || v == null ? (f.default ?? 0) : parseInt(v, 10);
        break;
      case 'date':
        data[f.name] = v ? new Date(v) : null;
        break;
      case 'lines':
        data[f.name] = typeof v === 'string' ? v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
        break;
      default:
        data[f.name] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
    }
  }
  return data;
}

// Initial form values for a new record.
function defaultValues(fields) {
  const values = {};
  for (const f of fields) {
    if (isFileField(f)) continue;
    values[f.name] = typeof f.default === 'function' ? f.default() : f.default ?? (f.type === 'checkbox' ? false : '');
  }
  return values;
}

function slugify(text) {
  return (
    String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || 'item'
  );
}

module.exports = { isFileField, resolveOptions, fieldRules, collectErrors, toData, defaultValues, slugify, SLUG_RE };
