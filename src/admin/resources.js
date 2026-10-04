// Admin resource definitions used by the generic CRUD router (src/admin/crud.js).
// Field options are documented in src/admin/fields.js.

const { prisma } = require('../lib/db');
const { parseVideoUrl } = require('../services/video');
const albumPhotos = require('./albumPhotos');
const { FILE_KINDS } = require('../middleware/upload');
const { destroyFile } = require('../services/storage');

const PUBLISHED = { name: 'isPublished', label: 'Show on the website', type: 'checkbox', default: true };
const ORDER = {
  name: 'displayOrder',
  label: 'Display order',
  type: 'number',
  default: 0,
  help: 'Lower numbers appear first.',
};
const AUDIENCE_OPTIONS = [
  { value: 'PUBLIC', label: 'Public (everyone, including tutors)' },
  { value: 'TUTORS', label: 'Tutors only (requires login)' },
];

async function activityOptions() {
  const activities = await prisma.activity.findMany({
    orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    select: { id: true, title: true },
  });
  return activities.map((a) => ({ value: a.id, label: a.title }));
}

const today = () => new Date().toISOString().slice(0, 10);

module.exports = [
  {
    key: 'team',
    model: 'teamMember',
    label: 'Team members',
    singular: 'team member',
    titleField: 'name',
    intro: 'People shown on the Project Team page.',
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    columns: [
      { label: 'Photo', field: 'photoUrl', type: 'image' },
      { label: 'Name', field: 'name' },
      { label: 'Reference', field: 'referenceCode', type: 'badge' },
      { label: 'Title', field: 'title' },
      { label: 'Institution', field: 'institution' },
      { label: 'Order', field: 'displayOrder' },
      { label: 'Status', field: 'isPublished', type: 'published' },
    ],
    fields: [
      { name: 'name', label: 'Full name', type: 'text', required: true, max: 120 },
      { name: 'title', label: 'Position or title', type: 'text', required: true, max: 150 },
      {
        name: 'referenceCode', label: 'Team reference', type: 'text', max: 12,
        placeholder: 'e.g. K-2', help: 'Use K-1, K-2 and so on for key personnel. Leave blank for project support.',
        validate: (value) => {
          if (!/^K-[1-9]\d{0,3}$/i.test(value)) throw new Error('Use a reference such as K-1 or K-10.');
          return true;
        },
      },
      { name: 'institution', label: 'Institution', type: 'text', max: 150, placeholder: 'e.g. Kenyatta University' },
      { name: 'email', label: 'Email address', type: 'email', max: 254, help: 'Shown on the Project Team page. Leave blank to hide.' },
      {
        name: 'phone', label: 'Mobile number', type: 'text', max: 40,
        help: 'Shown on the Project Team page. Include a country code for international callers.',
        validate: (value) => {
          const digits = value.replace(/\D/g, '');
          if (!/^\+?[\d\s().-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
            throw new Error('Enter a valid mobile number.');
          }
          return true;
        },
      },
      { name: 'bio', label: 'Short biography', type: 'textarea', rows: 6, max: 3000, help: 'Separate paragraphs with a blank line.' },
      ORDER,
      PUBLISHED,
      { name: 'photo', label: 'Portrait photo', type: 'image', folder: 'team', urlField: 'photoUrl', publicIdField: 'photoPublicId', help: `${FILE_KINDS.image.description}. Choose a clear, square portrait, ideally at least 400 × 400 pixels. You can add or replace it later.` },
    ],
    prepare: async (data, { item }) => {
      if (!data.referenceCode) return {};
      data.referenceCode = data.referenceCode.toUpperCase();
      const taken = await prisma.teamMember.findFirst({
        where: { referenceCode: data.referenceCode, ...(item ? { id: { not: item.id } } : {}) },
        select: { id: true },
      });
      return taken ? { referenceCode: 'This reference already belongs to another team member.' } : {};
    },
  },

  {
    key: 'activities',
    model: 'activity',
    label: 'Activities',
    singular: 'activity',
    intro: 'Project activities. Published activities appear in the Project Activities menu and on the home page.',
    orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    columns: [
      { label: 'Cover', field: 'coverImageUrl', type: 'image' },
      { label: 'Title', field: 'title' },
      { label: 'Web address', value: (a) => `/activities/${a.slug}` },
      { label: 'Order', field: 'displayOrder' },
      { label: 'Status', field: 'isPublished', type: 'published' },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, max: 150 },
      {
        name: 'slug',
        label: 'Web address',
        type: 'slug',
        from: 'title',
        prefix: '/activities/',
        help: 'Leave blank to create it from the title. Changing it breaks existing links to this page.',
      },
      { name: 'summary', label: 'Summary', type: 'textarea', rows: 3, max: 500, help: 'Shown on the home page card and at the top of the page.' },
      { name: 'body', label: 'Main text', type: 'textarea', rows: 12, help: 'Separate paragraphs with a blank line.' },
      {
        name: 'externalUrl',
        label: 'External link',
        type: 'url',
        help: 'Optional. For the Digital Learning Management System, enter the address of the external LMS.',
      },
      ORDER,
      PUBLISHED,
      { name: 'cover', label: 'Cover image', type: 'image', folder: 'activities', urlField: 'coverImageUrl', publicIdField: 'coverImagePublicId' },
    ],
    deleteWarning: async (activity) => {
      const [albums, videos] = await Promise.all([
        prisma.album.count({ where: { activityId: activity.id } }),
        prisma.video.count({ where: { activityId: activity.id } }),
      ]);
      if (!albums && !videos) return null;
      return `${albums} album(s) and ${videos} video(s) are linked to this activity. They will be kept but no longer linked.`;
    },
  },

  {
    key: 'documents',
    model: 'document',
    label: 'Documents',
    singular: 'document',
    intro: 'Curriculum and project documents. "Tutors only" documents are visible after login.',
    orderBy: [{ createdAt: 'desc' }],
    columns: [
      { label: 'Title', field: 'title' },
      { label: 'Category', field: 'category' },
      { label: 'Audience', field: 'audience', type: 'badge' },
      { label: 'Size', field: 'fileSize', type: 'bytes' },
      { label: 'Added', field: 'createdAt', type: 'date' },
      { label: 'Status', field: 'isPublished', type: 'published' },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, max: 200 },
      {
        name: 'category',
        label: 'Category',
        type: 'text',
        required: true,
        max: 80,
        placeholder: 'e.g. Curriculum framework',
        suggestions: async () =>
          (await prisma.document.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } })).map(
            (d) => d.category
          ),
      },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3, max: 1000 },
      { name: 'audience', label: 'Who can see it', type: 'select', required: true, options: AUDIENCE_OPTIONS, default: 'TUTORS' },
      PUBLISHED,
      {
        name: 'file',
        label: 'File',
        type: 'file',
        required: true,
        folder: 'documents',
        urlField: 'fileUrl',
        publicIdField: 'filePublicId',
        meta: { fileName: 'fileName', mimeType: 'mimeType', fileSize: 'fileSize' },
        downloadUrl: (doc) => `/documents/${doc.id}/download`, // documents are private; never link the stored URL
        help: `${FILE_KINDS.document.description}. Choosing a new file replaces the current one.`,
      },
    ],
  },

  {
    key: 'albums',
    model: 'album',
    label: 'Photo albums',
    singular: 'album',
    intro: 'Albums for the Project in Pictures and Videos page. Create an album, then add photos to it.',
    orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    listInclude: { activity: { select: { title: true } }, _count: { select: { photos: true } } },
    columns: [
      { label: 'Title', field: 'title' },
      { label: 'Date', field: 'date', type: 'date' },
      { label: 'Activity', value: (a) => (a.activity ? a.activity.title : '') },
      { label: 'Photos', value: (a) => a._count.photos },
      { label: 'Status', field: 'isPublished', type: 'published' },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, max: 150 },
      { name: 'slug', label: 'Web address', type: 'slug', from: 'title', prefix: '/gallery/', help: 'Leave blank to create it from the title.' },
      { name: 'date', label: 'Date', type: 'date', help: 'When the photos were taken.' },
      { name: 'activityId', label: 'Linked activity', type: 'select', options: activityOptions, emptyLabel: 'None' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3, max: 1000 },
      PUBLISHED,
    ],
    redirectAfterCreate: true,
    formExtras: albumPhotos.formExtras,
    extraRoutes: albumPhotos.routes,
    filesToDelete: async (album) =>
      (await prisma.photo.findMany({ where: { albumId: album.id }, select: { publicId: true } })).map((p) => ({
        publicId: p.publicId,
        kind: 'image',
      })),
    deleteWarning: async (album) => {
      const photos = await prisma.photo.count({ where: { albumId: album.id } });
      return photos ? `This will also permanently delete the ${photos} photo(s) in this album.` : null;
    },
  },

  {
    key: 'videos',
    model: 'video',
    label: 'Videos',
    singular: 'video',
    intro: 'Videos shown on the Project in Pictures and Videos page. Edit titles, descriptions, order and publication status here.',
    orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { displayOrder: 'asc' }, { createdAt: 'desc' }],
    listInclude: { activity: { select: { title: true } } },
    columns: [
      { label: 'Preview', value: (v) => (parseVideoUrl(v.embedUrl) || {}).thumbnailUrl, type: 'image' },
      { label: 'Title', field: 'title' },
      { label: 'Provider', field: 'provider', type: 'badge' },
      { label: 'Activity', value: (v) => (v.activity ? v.activity.title : '') },
      { label: 'Date', field: 'date', type: 'date' },
      { label: 'Status', field: 'isPublished', type: 'published' },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, max: 150 },
      {
        name: 'embedUrl',
        label: 'Video link',
        type: 'url',
        required: true,
        placeholder: 'https://www.youtube.com/watch?v=...',
        help: 'Use a YouTube or Vimeo link, or the secure video URL from Cloudinary.',
        validate: (value) => {
          if (!parseVideoUrl(value)) throw new Error('Enter a valid YouTube, Vimeo or Cloudinary video link.');
          return true;
        },
      },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3, max: 1000 },
      { name: 'activityId', label: 'Linked activity', type: 'select', options: activityOptions, emptyLabel: 'None' },
      { name: 'date', label: 'Date', type: 'date' },
      ORDER,
      PUBLISHED,
    ],
    prepare: (data, { item }) => {
      const parsed = parseVideoUrl(data.embedUrl);
      data.embedUrl = parsed.embedUrl;
      data.provider = parsed.provider;
      // A different version or delivery transformation can still reference the same owned asset.
      const sameAsset = item?.videoPublicId && parsed.provider === 'CLOUDINARY' &&
        new URL(item.embedUrl).pathname.split('/')[1] === new URL(data.embedUrl).pathname.split('/')[1] &&
        new URL(data.embedUrl).pathname.replace(/\.[^.]+$/, '').endsWith('/' + item.videoPublicId);
      if (item && item.embedUrl !== data.embedUrl && !sameAsset) {
        data.videoPublicId = null;
        data.width = data.height = data.duration = null;
      }
    },
    afterUpdate: async (item, data) => {
      if (item.videoPublicId && data.videoPublicId === null) await destroyFile(item.videoPublicId, 'video');
    },
    filesToDelete: async (item) => item.videoPublicId ? [{ publicId: item.videoPublicId, kind: 'video' }] : [],
  },

  {
    key: 'announcements',
    model: 'announcement',
    label: 'Announcements',
    singular: 'announcement',
    intro: 'News and notices. "Tutors only" announcements appear on the tutor dashboard.',
    orderBy: [{ publishedAt: 'desc' }],
    listInclude: { author: { select: { name: true } } },
    columns: [
      { label: 'Title', field: 'title' },
      { label: 'Audience', field: 'audience', type: 'badge' },
      { label: 'Date', field: 'publishedAt', type: 'date' },
      { label: 'Author', value: (a) => (a.author ? a.author.name : '') },
      { label: 'Status', field: 'isPublished', type: 'published' },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, max: 200 },
      { name: 'body', label: 'Message', type: 'textarea', rows: 8, required: true, max: 10000, help: 'Separate paragraphs with a blank line.' },
      { name: 'audience', label: 'Who can see it', type: 'select', required: true, options: AUDIENCE_OPTIONS, default: 'TUTORS' },
      { name: 'publishedAt', label: 'Date', type: 'date', required: true, default: today },
      PUBLISHED,
    ],
    beforeCreate: (req) => ({ authorId: req.user.id }),
  },

  {
    key: 'partners',
    model: 'partner',
    label: 'Partners',
    singular: 'partner',
    titleField: 'name',
    intro: 'Partner organisations shown in the footer of every page.',
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    columns: [
      { label: 'Logo', field: 'logoUrl', type: 'image' },
      { label: 'Name', field: 'name' },
      { label: 'Main partner', field: 'isMain', type: 'yesno' },
      { label: 'Order', field: 'displayOrder' },
      { label: 'Status', field: 'isPublished', type: 'published' },
    ],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, max: 150 },
      { name: 'shortName', label: 'Short name', type: 'text', max: 60, placeholder: 'e.g. MoGEI' },
      { name: 'url', label: 'Website', type: 'url' },
      { name: 'isMain', label: 'Main partner', type: 'checkbox', default: false },
      ORDER,
      PUBLISHED,
      { name: 'logo', label: 'Logo', type: 'image', folder: 'partners', urlField: 'logoUrl', publicIdField: 'logoPublicId', help: 'A logo on a white or transparent background works best.' },
    ],
  },
];
