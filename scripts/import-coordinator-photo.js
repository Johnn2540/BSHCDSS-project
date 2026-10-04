// Import supplied project photos; select --team-lead or --digital-learning as needed.
// Later edits belong in Admin > Albums. Re-runs retain existing photos and admin edits.
require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { prisma, pool } = require('../src/lib/db');
const { uploadFile, destroyFile, isCloudinaryConfigured } = require('../src/services/storage');
const { validImageSignature, FILE_KINDS } = require('../src/middleware/upload');
const { clearCache } = require('../src/services/content');

const photos = {
  coordinator: { id: 'project-technical-coordinator-addressing-participants', filename: 'Project Technical Coordinator addressing participants.png', caption: 'Project Technical Coordinator addressing participants.' },
  teamLead: { id: 'team-lead-addressing-participants', filename: 'Team Lead Addressing participants.png', caption: 'Team Lead addressing participants.' },
  digitalLearning: { id: 'team-on-digital-learning-content', filename: 'Team on Digital Learning content.png', caption: 'Photo collection: team working on digital learning content.' },
};
const photoKey = process.argv.includes('--digital-learning') ? 'digitalLearning' : process.argv.includes('--team-lead') ? 'teamLead' : 'coordinator';
const entry = photos[photoKey];
const photoId = entry.id;
const slug = 'project-coordination-and-engagement';
const caption = entry.caption;

async function main() {
  const existing = await prisma.photo.findUnique({ where: { id: photoId }, include: { album: { select: { slug: true } } } });
  if (existing) {
    console.log('Photo already added; admin edits retained. /gallery/' + existing.album.slug);
    return;
  }
  if (!isCloudinaryConfigured) throw new Error('Configure Cloudinary before importing the project photograph.');
  const filename = entry.filename;
  const buffer = await fs.readFile(path.join(__dirname, '..', 'public', 'images', filename));
  if (!validImageSignature(buffer) || buffer.length > FILE_KINDS.image.maxBytes) throw new Error('Choose a valid image within the upload size limit.');
  const existingAlbum = await prisma.album.findUnique({ where: { slug } });
  const albumId = existingAlbum?.id || 'project-coordination-engagement';
  const stored = await uploadFile({ buffer, size: buffer.length, originalname: filename, mimetype: 'image/png' }, { folder: 'albums/' + albumId, kind: 'image' });
  try {
    await prisma.$transaction(async (tx) => {
      const album = await tx.album.upsert({
        where: { slug }, update: {},
        create: { id: albumId, slug, title: 'Project Coordination and Engagement', description: 'Project leadership addressing participants.', isPublished: true },
      });
      if (process.argv.includes('--team-lead')) {
        await tx.album.updateMany({
          where: { id: album.id, description: 'The Project Technical Coordinator addressing participants.' },
          data: { description: 'Project leadership addressing participants.' },
        });
      }
      if (photoKey === 'digitalLearning') {
        // Broaden the starter copy while retaining any customised admin text.
        await tx.album.updateMany({
          where: { id: album.id, title: 'Project Coordination and Engagement' },
          data: { title: 'Project Activities and Engagement' },
        });
        await tx.album.updateMany({
          where: { id: album.id, description: { in: ['The Project Technical Coordinator addressing participants.', 'Project leadership addressing participants.'] } },
          data: { description: 'Project leadership, participant engagement and collaboration on digital learning content.' },
        });
      }
      const last = await tx.photo.findFirst({ where: { albumId: album.id }, orderBy: { displayOrder: 'desc' }, select: { displayOrder: true } });
      await tx.photo.create({ data: {
        id: photoId, albumId: album.id, caption, imageUrl: stored.url, publicId: stored.publicId,
        width: stored.width, height: stored.height, displayOrder: photoKey === 'digitalLearning' ? 0 : (last?.displayOrder || 0) + 1,
      } });
    });
  } catch (error) {
    await destroyFile(stored.publicId, 'image');
    throw error;
  }
  clearCache();
  console.log('Photo published with its caption and original dimensions: ' + stored.width + ' × ' + stored.height);
  console.log('View: /gallery/' + slug);
  console.log('Manage: /admin/albums/' + albumId + '/edit#photos');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await pool.end(); });
