// File storage for uploaded images, videos and documents.
//
// Images are public (they appear on the website).
// Documents are private: they are never linked directly. Every download goes through
// GET /documents/:id/download, which checks access and then issues a short-lived link.
//
// Uses Cloudinary when configured. In development without Cloudinary keys, images are
// written to public/uploads/ and documents to uploads/ (not web-accessible) instead.

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const isProd = process.env.NODE_ENV === 'production';
const ROOT_FOLDER = 'bshcdss';
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Local fallbacks (development only)
const PUBLIC_PREFIX = 'local:'; // public/uploads/  (images, served statically)
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public', 'uploads');
const PRIVATE_PREFIX = 'private:'; // uploads/  (documents, only via the download route)
const PRIVATE_DIR = path.join(PROJECT_ROOT, 'uploads');

const DOWNLOAD_LINK_TTL_SECONDS = 10 * 60;

const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// Documents use Cloudinary's "authenticated" delivery type, so the plain URL doesn't work
// and a signed link is required.
const DOCUMENT_OPTIONS = { resource_type: 'raw', type: 'authenticated' };

// kind: 'image', 'video' or 'document'
function uploadToCloudinary(file, { folder, kind }) {
  const options =
    kind === 'image' || kind === 'video'
      ? { folder: `${ROOT_FOLDER}/${folder}`, resource_type: kind, overwrite: false }
      : {
          ...DOCUMENT_OPTIONS,
          folder: `${ROOT_FOLDER}/${folder}`,
          use_filename: true, // raw files keep their extension in the public ID
          unique_filename: true,
          filename_override: file.originalname,
        };

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve({
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        width: result.width || null,
        height: result.height || null,
        duration: result.duration || null,
      });
    });
    stream.end(file.buffer);
  });
}

async function uploadToLocal(file, { folder, kind }) {
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const name = `${crypto.randomBytes(12).toString('hex')}${ext}`;
  const isPrivate = kind === 'document';
  const dir = path.join(isPrivate ? PRIVATE_DIR : PUBLIC_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), file.buffer);
  const publicId = `${isPrivate ? PRIVATE_PREFIX : PUBLIC_PREFIX}${folder}/${name}`;
  return {
    url: isPrivate ? publicId : `/uploads/${folder}/${name}`,
    publicId,
    bytes: file.size,
    width: null,
    height: null,
  };
}

async function uploadFile(file, { folder, kind }) {
  if (isCloudinaryConfigured) return uploadToCloudinary(file, { folder, kind });
  if (isProd) throw new Error('Cloudinary is not configured; cannot upload files.');
  return uploadToLocal(file, { folder, kind });
}

// Resolves a local public ID to a path inside its base directory (never outside it).
function localPath(publicId, prefix, baseDir) {
  const target = path.resolve(baseDir, publicId.slice(prefix.length));
  return target.startsWith(baseDir + path.sep) ? target : null;
}

// Never throws: a failed clean-up shouldn't break the admin action that triggered it.
async function destroyFile(publicId, kind) {
  if (!publicId) return;
  try {
    if (publicId.startsWith(PUBLIC_PREFIX) || publicId.startsWith(PRIVATE_PREFIX)) {
      const target = publicId.startsWith(PUBLIC_PREFIX)
        ? localPath(publicId, PUBLIC_PREFIX, PUBLIC_DIR)
        : localPath(publicId, PRIVATE_PREFIX, PRIVATE_DIR);
      if (target) await fs.unlink(target);
      return;
    }
    if (isCloudinaryConfigured) {
      await cloudinary.uploader.destroy(publicId, kind === 'image' || kind === 'video' ? { resource_type: kind, invalidate: true } : DOCUMENT_OPTIONS);
    }
  } catch (err) {
    console.error(`Could not delete stored file ${publicId}:`, err.message);
  }
}

// Where to send a user who is allowed to download a document.
// Returns { path } for a local file, or { url } for a short-lived Cloudinary download link.
function documentDownload(publicId) {
  if (publicId.startsWith(PRIVATE_PREFIX)) {
    const target = localPath(publicId, PRIVATE_PREFIX, PRIVATE_DIR);
    return target ? { path: target } : null;
  }
  if (!isCloudinaryConfigured) return null;
  return {
    url: cloudinary.utils.private_download_url(publicId, '', {
      ...DOCUMENT_OPTIONS,
      attachment: true,
      expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_LINK_TTL_SECONDS,
    }),
  };
}

module.exports = { uploadFile, destroyFile, documentDownload, isCloudinaryConfigured };
