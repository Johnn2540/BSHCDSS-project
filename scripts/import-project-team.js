// Import the supplied K-1 to K-10 roster without replacing biographies or portraits.
// The --dry-run option makes no changes. --migrate-portraits moves existing local
// portraits to configured Cloudinary storage; source files remain in the project.
require('dotenv').config({ quiet: true });
const fs = require('fs/promises');
const path = require('path');
const { prisma, pool } = require('../src/lib/db');
const content = require('../src/services/content');
const { uploadFile, destroyFile, isCloudinaryConfigured } = require('../src/services/storage');
const roster = require('../src/data/projectTeam');
const dryRun = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';

async function main() {
  const existing = await prisma.teamMember.findMany();
  const matches = roster.map((entry) => {
    const candidates = existing.filter((member) => member.id === entry.id ||
      member.referenceCode === entry.referenceCode || member.name.toLowerCase() === entry.name.toLowerCase() ||
      (entry.email && member.email && member.email.toLowerCase() === entry.email.toLowerCase()));
    if (candidates.length > 1) throw new Error('Multiple profiles match ' + entry.name + '; import stopped before making changes.');
    return { entry, member: candidates[0] };
  });
  if (new Set(matches.filter((match) => match.member).map((match) => match.member.id)).size !== matches.filter((match) => match.member).length) {
    throw new Error('The roster matches one profile more than once; import stopped.');
  }
  if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      for (const { entry, member } of matches) {
        const { id, ...details } = entry;
        const data = { ...details, displayOrder: Number(entry.referenceCode.slice(2)), isPublished: true };
        if (member) await tx.teamMember.update({ where: { id: member.id }, data });
        else await tx.teamMember.create({ data: { id, ...data } });
      }
      const config = content.getPageConfig('team');
      const page = await tx.pageContent.findUnique({ where: { slug: 'team' } });
      const defaults = content.valuesToRow(config, content.rowToValues(config, null));
      // Keep any customised page copy; remove the old starter "more members" note.
      const sections = { ...(page?.sections || {}) };
      if (sections.moreNote === 'More team members will appear here as their profiles are added.') sections.moreNote = '';
      await tx.pageContent.upsert({
        where: { slug: 'team' }, create: { slug: 'team', ...defaults },
        update: { sections },
      });
    }, { timeout: 30000 });
  }
  for (const { entry, member } of matches) console.log((dryRun ? 'Would save: ' : 'Saved: ') + entry.referenceCode + ' ' + entry.name + (member ? ' (existing profile retained)' : ''));

  if (!dryRun && process.argv.includes('--migrate-portraits')) {
    if (!isCloudinaryConfigured) throw new Error('Cloudinary must be configured to migrate portraits.');
    const publicDir = path.resolve(__dirname, '..', 'public');
    const profiles = await prisma.teamMember.findMany();
    for (const member of profiles) {
      if (!member.photoUrl?.startsWith('/images/team/') || member.photoPublicId) continue;
      const source = path.resolve(publicDir, member.photoUrl.slice(1));
      if (!source.startsWith(publicDir + path.sep)) throw new Error('Portrait path is outside the public folder.');
      const buffer = await fs.readFile(source);
      const ext = path.extname(source).toLowerCase();
      const mimetype = ({ '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[ext];
      if (!mimetype) throw new Error('Unsupported portrait format.');
      const stored = await uploadFile({ buffer, size: buffer.length, originalname: path.basename(source), mimetype }, { folder: 'team', kind: 'image' });
      try {
        // An admin could replace this photo while the import runs; preserve that edit.
        const saved = await prisma.teamMember.updateMany({ where: { id: member.id, photoUrl: member.photoUrl, photoPublicId: null }, data: { photoUrl: stored.url, photoPublicId: stored.publicId } });
        if (!saved.count) await destroyFile(stored.publicId, 'image');
        else console.log('Cloudinary portrait ready: ' + member.name);
      } catch (error) {
        await destroyFile(stored.publicId, 'image');
        throw error;
      }
    }
  }
  content.clearCache();
  console.log(dryRun ? 'Roster validated. No changes made.' : 'All ten key personnel are ready in Admin > Team members.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
