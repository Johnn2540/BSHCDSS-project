// Import the supplied video once. Admin edits are retained when this is run again.
require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { prisma, pool } = require('../src/lib/db');
const { uploadFile, destroyFile, isCloudinaryConfigured } = require('../src/services/storage');
const { clearCache } = require('../src/services/content');

async function main() {
  const id = 'project-participant-engagement-video';
  if (await prisma.video.findUnique({ where: { id } })) {
    console.log('Video already imported; existing content and admin edits retained.');
    return;
  }
  if (!isCloudinaryConfigured) throw new Error('Configure Cloudinary before importing the project video.');
  const buffer = await fs.readFile(path.join(__dirname, '..', 'public', 'Videos', 'video.mp4'));
  if (buffer.subarray(4, 8).toString('ascii') !== 'ftyp' || buffer.length > 100 * 1024 * 1024) {
    throw new Error('The source must be a valid MP4 file under 100 MB.');
  }
  const stored = await uploadFile({ buffer, originalname: 'video.mp4', mimetype: 'video/mp4', size: buffer.length }, { folder: 'videos', kind: 'video' });
  try {
    await prisma.video.create({ data: {
      id, title: 'Participant engagement session', description: 'Project participants taking part in a group session.',
      embedUrl: stored.url, provider: 'CLOUDINARY', videoPublicId: stored.publicId,
      width: stored.width, height: stored.height, duration: stored.duration,
      displayOrder: 1, isPublished: true,
    } });
  } catch (error) {
    await destroyFile(stored.publicId, 'video');
    throw error;
  }
  clearCache();
  console.log('Video ready: ' + stored.width + ' × ' + stored.height + ', ' + Math.round(stored.duration) + ' seconds.');
  console.log('View: /gallery#videos');
  console.log('Manage: /admin/videos/' + id + '/edit');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await pool.end(); });
