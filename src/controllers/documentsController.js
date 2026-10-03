// Document downloads. Documents are never linked directly: this route checks who may
// download the file, then sends it (local dev) or redirects to a short-lived signed link.
//   PUBLIC + published  -> anyone
//   TUTORS + published  -> logged-in tutors and admins
//   unpublished         -> admins only

const createError = require('http-errors');
const { prisma } = require('../lib/db');
const { documentDownload } = require('../services/storage');

async function download(req, res) {
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    select: { id: true, filePublicId: true, fileName: true, audience: true, isPublished: true },
  });
  if (!doc) throw createError(404, 'Document not found');

  const role = req.user && req.user.role;
  const allowed =
    role === 'ADMIN' || (doc.isPublished && (doc.audience === 'PUBLIC' || (doc.audience === 'TUTORS' && role === 'TUTOR')));

  if (!allowed) {
    if (!req.user && doc.isPublished && doc.audience === 'TUTORS') {
      req.session.returnTo = req.originalUrl;
      req.flash('info', 'Please log in to download this document.');
      return res.redirect('/login');
    }
    throw createError(404, 'Document not found'); // don't reveal that it exists
  }

  const target = documentDownload(doc.filePublicId);
  if (!target) throw createError(404, 'Document file not available');

  res.set('Cache-Control', 'private, no-store');
  if (target.path) return res.download(target.path, doc.fileName || 'document');
  res.redirect(target.url);
}

module.exports = { download };
