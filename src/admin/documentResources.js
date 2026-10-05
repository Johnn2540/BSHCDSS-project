const { prisma } = require('../lib/db');
const sections = require('../config/tutorSections');
const { FILE_KINDS } = require('../middleware/upload');
const audienceOptions = [
  { value: 'PUBLIC', label: 'Public (anyone can download)' },
  { value: 'TUTORS', label: 'Approved tutors only (requires login)' },
];

module.exports = sections.map((section) => ({
  key: section.key, model: 'document', label: section.label, singular: section.singular,
  where: { portalSection: section.value },
  intro: `Manage files in the ${section.label} section of the Tutor Portal. Choose who can download each file and publish it when ready.`,
  orderBy: [{ createdAt: 'desc' }],
  redirectAfterSave: (item) => sections.find((entry) => entry.value === item.portalSection).adminHref,
  columns: [
    { label: 'Title', field: 'title' }, { label: 'Category', field: 'category' },
    { label: 'Audience', field: 'audience', type: 'badge' },
    { label: 'Size', field: 'fileSize', type: 'bytes' },
    { label: 'Updated', field: 'updatedAt', type: 'date' },
    { label: 'Status', field: 'isPublished', type: 'published' },
  ],
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, max: 200 },
    { name: 'portalSection', label: 'Portal section', type: 'select', required: true, default: section.value,
      options: sections.map((entry) => ({ value: entry.value, label: entry.label })),
      help: 'Choose where this file belongs. Changing this moves the file to that section.' },
    { name: 'category', label: 'Category', type: 'text', required: true, max: 80,
      placeholder: section.key === 'reports' ? 'e.g. Training reports' : section.key === 'plans' ? 'e.g. Work plans' : 'e.g. Curriculum framework',
      suggestions: async () => (await prisma.document.findMany({ where: { portalSection: section.value }, distinct: ['category'],
        select: { category: true }, orderBy: { category: 'asc' } })).map((row) => row.category) },
    { name: 'description', label: 'Description', type: 'textarea', rows: 3, max: 1000 },
    { name: 'audience', label: 'Who can download', type: 'select', required: true, options: audienceOptions, default: 'TUTORS',
      help: 'Public files can be downloaded without signing in. Use approved tutors only for internal resources.' },
    { name: 'isPublished', label: 'Publish this file', type: 'checkbox', default: false,
      help: 'Published files appear in the selected portal section. Drafts are visible to administrators only.' },
    { name: 'file', label: 'File', type: 'file', required: true, folder: 'documents', urlField: 'fileUrl', publicIdField: 'filePublicId',
      meta: { fileName: 'fileName', mimeType: 'mimeType', fileSize: 'fileSize' },
      downloadUrl: (doc) => `/documents/${doc.id}/download`,
      help: `${FILE_KINDS.document.description}. Choosing a new file replaces the current one.` },
  ],
}));
