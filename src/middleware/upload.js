// Multer upload handling. Files are kept in memory and passed to the storage service.
// Upload errors (wrong type, too large) don't throw; they are collected on req.uploadErrors
// so the form can be re-rendered with a message next to the field.

const path = require('path');
const multer = require('multer');

const MB = 1024 * 1024;

// Vercel rejects any request body over 4.5 MB before it reaches the app, so on Vercel each
// file (and each whole upload form) must stay under that.
const ON_VERCEL = Boolean(process.env.VERCEL);
const IMAGE_MAX_MB = ON_VERCEL ? 4 : 5;
const DOCUMENT_MAX_MB = ON_VERCEL ? 4 : 20;
// Total size of one upload form submission; checked in the browser before sending (site.js).
const MAX_REQUEST_BYTES = ON_VERCEL ? Math.floor(4.4 * MB) : null;

function validImageSignature(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;
  return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP');
}

const FILE_KINDS = {
  image: {
    maxBytes: IMAGE_MAX_MB * MB,
    maxMb: IMAGE_MAX_MB,
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    description: `JPG, PNG or WebP image up to ${IMAGE_MAX_MB} MB`,
  },
  document: {
    maxBytes: DOCUMENT_MAX_MB * MB,
    maxMb: DOCUMENT_MAX_MB,
    extensions: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'],
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    description: `PDF, Word, PowerPoint or Excel file up to ${DOCUMENT_MAX_MB} MB`,
  },
};

// fields: [{ name, kind: 'image'|'document', maxCount? }]
function upload(fields) {
  const kindByField = Object.fromEntries(fields.map((f) => [f.name, FILE_KINDS[f.kind]]));
  const maxBytes = Math.max(...fields.map((f) => FILE_KINDS[f.kind].maxBytes));

  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: Math.max(...fields.map((f) => f.maxCount || 1)), fields: 100 },
    fileFilter(req, file, cb) {
      const kind = kindByField[file.fieldname];
      const ext = path.extname(file.originalname).toLowerCase();
      if (!kind || !kind.extensions.includes(ext) || !kind.mimeTypes.includes(file.mimetype)) {
        req.uploadErrors = { ...req.uploadErrors, [file.fieldname]: `Please choose a ${kind ? kind.description : 'valid file'}.` };
        return cb(null, false);
      }
      cb(null, true);
    },
  }).fields(fields.map((f) => ({ name: f.name, maxCount: f.maxCount || 1 })));

  return (req, res, next) => {
    req.uploadErrors = {};
    handler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const field = err.field || fields[0].name;
        const kind = kindByField[field] || FILE_KINDS[fields[0].kind];
        req.uploadErrors[field] =
          err.code === 'LIMIT_FILE_SIZE'
            ? `File is too large. Please choose a ${kind.description}.`
            : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
              ? 'Too many files selected.'
              : 'The upload could not be processed.';
        req.body = req.body || {};
        req.files = {};
        return next();
      }
      if (err) return next(err);

      // Per-kind size check (multer's limit is the largest across all fields).
      for (const [name, files] of Object.entries(req.files || {})) {
        const kind = kindByField[name];
        if (files.some((f) => f.size > kind.maxBytes)) {
          req.uploadErrors[name] = `File is too large. Please choose a ${kind.description}.`;
          req.files[name] = [];
        } else if (fields.find((field) => field.name === name).kind === 'image' && files.some((file) => !validImageSignature(file.buffer))) {
          req.uploadErrors[name] = 'The selected file is not a valid JPG, PNG or WebP image. Please choose another portrait or image.';
          req.files[name] = [];
        }
      }
      next();
    });
  };
}

module.exports = { upload, FILE_KINDS, MAX_REQUEST_BYTES, validImageSignature };
