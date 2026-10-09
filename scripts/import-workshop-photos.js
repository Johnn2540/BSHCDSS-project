// Import the supplied workshop photos into two gallery albums (Photos). Safe to run again: an album that already
// exists is left alone, so later edits in Admin > Albums (titles, dates, captions, order) are kept.
// Usage: npm run photos:import            (uploads to Cloudinary and writes the database)
//        npm run photos:import -- --dry   (lists what would be imported; touches nothing)
require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');

const IMAGES = path.join(__dirname, '..', 'public', 'images');
const photo = (time) => `WhatsApp Image 2026-10-09 at 10.03.${time}.jpeg`;

// The first photo of each album is its cover. Titles, descriptions and dates can be changed in the admin.
const ALBUMS = [
  {
    id: 'workshop-hands-on-sessions',
    title: 'Training workshop: hands-on sessions',
    description: 'Participants and facilitators working at laptops during a project training workshop.',
    photos: ['24 (1)', '24', '25 (1)', '24 (2)', '25 (2)', '25', '26', '20 (1)', '20', '21 (1)', '21', '34 (1)', '34 (2)', '34', '35'],
  },
  {
    id: 'workshop-main-hall',
    title: 'Training workshop: the main hall',
    description: 'Participants at tables with laptops, and group sessions in the main training hall.',
    photos: ['29 (1)', '29 (2)', '29', '30 (1)', '30', '31 (1)', '31 (2)', '31', '32 (1)', '32', '15', '16 (1)', '16', '35 (1)'],
  },
];

async function main() {
  const dry = process.argv.includes('--dry');
  for (const album of ALBUMS) {
    for (const time of album.photos) await fs.access(path.join(IMAGES, photo(time)));
  }
  if (dry) {
    ALBUMS.forEach((a) => console.log(`${a.title}: ${a.photos.length} photos (cover: ${photo(a.photos[0])})`));
    return;
  }

  const { prisma, pool } = require('../src/lib/db');
  const { uploadFile, destroyFile, isCloudinaryConfigured } = require('../src/services/storage');
  const { clearCache } = require('../src/services/content');
  try {
    if (!isCloudinaryConfigured && process.env.NODE_ENV === 'production') throw new Error('Configure Cloudinary before importing the photos.');
    for (const album of ALBUMS) {
      if (await prisma.album.findUnique({ where: { id: album.id } })) {
        console.log(`${album.title}: already imported; existing content and admin edits retained.`);
        continue;
      }
      const stored = [];
      try {
        for (const time of album.photos) {
          const name = photo(time);
          const buffer = await fs.readFile(path.join(IMAGES, name));
          if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error(`${name} is not a JPEG.`);
          stored.push(await uploadFile({ buffer, originalname: name, mimetype: 'image/jpeg', size: buffer.length }, { folder: `albums/${album.id}`, kind: 'image' }));
        }
        await prisma.album.create({
          data: {
            id: album.id,
            slug: album.id,
            title: album.title,
            description: album.description,
            isPublished: true,
            photos: {
              create: stored.map((file, index) => ({
                imageUrl: file.url, publicId: file.publicId, width: file.width, height: file.height, displayOrder: index + 1,
              })),
            },
          },
        });
      } catch (error) {
        for (const file of stored) await destroyFile(file.publicId, 'image');
        throw error;
      }
      console.log(`${album.title}: ${stored.length} photos imported.`);
      console.log(`Manage: /admin/albums/${album.id}/edit`);
    }
    clearCache();
    console.log('View: /gallery');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
