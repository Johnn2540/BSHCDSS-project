// Imports the supplied collection into the existing document CMS and private storage.
// Re-running preserves existing documents and any subsequent admin edits.
require('dotenv').config({ quiet: true });

const fs = require('fs/promises');
const path = require('path');
const { prisma, pool } = require('../src/lib/db');
const { uploadFile, destroyFile, isCloudinaryConfigured } = require('../src/services/storage');
const content = require('../src/services/content');
const catalogue = require('../src/data/curriculumDocuments');

const sourceDir = path.join(__dirname, '..', 'documents', 'Collection of Curriculum Designs in Different Subject Areas');
const dryRun = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';

async function main() {
  // Validate the whole collection before uploading anything.
  const files = await Promise.all(catalogue.map(async (entry) => {
    if (path.basename(entry.fileName) !== entry.fileName) throw new Error('Invalid source filename.');
    const buffer = await fs.readFile(path.join(sourceDir, entry.fileName));
    const docx = entry.fileName.endsWith('.docx');
    const signature = buffer.subarray(0, docx ? 4 : 8).toString('hex');
    if (signature !== (docx ? '504b0304' : 'd0cf11e0a1b11ae1')) {
      throw new Error(`The source file is not a valid Word document: ${entry.fileName}`);
    }
    return { entry, file: {
      buffer, size: buffer.length, originalname: entry.fileName,
      mimetype: docx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword',
    } };
  }));

  if (!dryRun && process.env.VERCEL && !isCloudinaryConfigured) {
    throw new Error('Cloudinary must be configured to import documents for Vercel.');
  }

  let added = 0;
  let skipped = 0;
  for (const { entry, file } of files) {
    const existing = await prisma.document.findFirst({
      where: { OR: [{ id: entry.id }, { fileName: entry.fileName }] },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      console.log(`Keep: ${entry.title}`);
      continue;
    }
    if (dryRun) {
      console.log(`Would import: ${entry.title} (${file.size} bytes)`);
      continue;
    }
    const stored = await uploadFile(file, { kind: 'document', folder: 'documents' });
    try {
      await prisma.document.create({ data: {
        id: entry.id, title: entry.title, description: entry.description, category: entry.category,
        fileUrl: stored.url, filePublicId: stored.publicId, fileName: file.originalname,
        mimeType: file.mimetype, fileSize: stored.bytes, audience: 'PUBLIC', isPublished: true,
      } });
    } catch (error) {
      await destroyFile(stored.publicId, 'document');
      throw error;
    }
    added++;
    console.log(`Imported: ${entry.title}`);
  }

  if (!dryRun) {
    const config = content.getPageConfig('curriculum');
    await prisma.pageContent.upsert({
      where: { slug: 'curriculum' },
      create: { slug: 'curriculum', ...content.valuesToRow(config, content.rowToValues(config, null)) },
      update: {},
    });
    content.clearCache();
  }
  console.log(dryRun
    ? `Validated ${files.length} source files; ${skipped} already in the library. No changes made.`
    : `Complete: ${added} imported, ${skipped} existing documents preserved.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
