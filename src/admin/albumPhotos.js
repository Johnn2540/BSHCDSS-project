// Photo management inside an album's edit screen.
//   POST /admin/albums/:id/photos                    upload one or more photos
//   POST /admin/albums/:id/photos/save               save captions and order
//   POST /admin/albums/:id/photos/:photoId/delete    delete one photo

const { prisma } = require('../lib/db');
const { upload, FILE_KINDS, MAX_REQUEST_BYTES } = require('../middleware/upload');
const { uploadFile, destroyFile } = require('../services/storage');

const MAX_PHOTOS_PER_UPLOAD = 20;
const MAX_CAPTION = 300;

async function formExtras(album) {
  const photos = await prisma.photo.findMany({
    where: { albumId: album.id },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return {
    partial: 'admin/album-photos',
    album,
    photos,
    maxPerUpload: MAX_PHOTOS_PER_UPLOAD,
    maxImageMb: FILE_KINDS.image.maxMb,
    maxTotalMb: MAX_REQUEST_BYTES ? Math.floor(MAX_REQUEST_BYTES / (1024 * 1024)) : null,
  };
}

function routes(router, { base, findOr404 }) {
  router.post(
    '/:id/photos',
    upload([{ name: 'photos', kind: 'image', maxCount: MAX_PHOTOS_PER_UPLOAD }]),
    async (req, res) => {
      const album = await findOr404(req.params.id);
      const editUrl = `${base}/${album.id}/edit#photos`;
      const files = (req.files && req.files.photos) || [];

      if (req.uploadErrors.photos) {
        req.flash('error', req.uploadErrors.photos);
        if (!files.length) return res.redirect(editUrl);
      } else if (!files.length) {
        req.flash('error', 'Choose at least one photo to upload.');
        return res.redirect(editUrl);
      }

      const last = await prisma.photo.findFirst({
        where: { albumId: album.id },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
      });
      let order = last ? last.displayOrder : 0;

      let added = 0;
      for (const file of files) {
        const stored = await uploadFile(file, { folder: `albums/${album.id}`, kind: 'image' });
        try {
          order += 1;
          await prisma.photo.create({
            data: {
              albumId: album.id,
              imageUrl: stored.url,
              publicId: stored.publicId,
              width: stored.width,
              height: stored.height,
              displayOrder: order,
            },
          });
          added += 1;
        } catch (err) {
          await destroyFile(stored.publicId, 'image');
          throw err;
        }
      }
      req.flash('success', `${added} photo(s) added.`);
      res.redirect(editUrl);
    }
  );

  router.post('/:id/photos/save', async (req, res) => {
    const album = await findOr404(req.params.id);
    const editUrl = `${base}/${album.id}/edit#photos`;
    const photos = await prisma.photo.findMany({ where: { albumId: album.id }, select: { id: true } });

    const updates = [];
    for (const { id } of photos) {
      const caption = String(req.body[`caption_${id}`] ?? '').trim();
      const order = parseInt(req.body[`order_${id}`], 10);
      if (caption.length > MAX_CAPTION) {
        req.flash('error', `Captions must be ${MAX_CAPTION} characters or fewer. Nothing was saved.`);
        return res.redirect(editUrl);
      }
      updates.push(
        prisma.photo.update({
          where: { id },
          data: { caption: caption || null, displayOrder: Number.isInteger(order) && order >= 0 ? Math.min(order, 100000) : 0 },
        })
      );
    }
    await prisma.$transaction(updates);
    req.flash('success', 'Photo captions and order saved.');
    res.redirect(editUrl);
  });

  router.post('/:id/photos/:photoId/delete', async (req, res) => {
    const album = await findOr404(req.params.id);
    const photo = await prisma.photo.findFirst({ where: { id: req.params.photoId, albumId: album.id } });
    if (photo) {
      await prisma.photo.delete({ where: { id: photo.id } });
      await destroyFile(photo.publicId, 'image');
      req.flash('success', 'Photo deleted.');
    }
    res.redirect(`${base}/${album.id}/edit#photos`);
  });
}

module.exports = { formExtras, routes };
