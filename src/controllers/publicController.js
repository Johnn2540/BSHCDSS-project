const createError = require('http-errors');
const { body } = require('express-validator');

const content = require('../services/content');
const { presentVideo } = require('../services/video');
const { sendMail, logMailError } = require('../services/mailer');
const { contactEmail } = require('../services/emailTemplates');
const { collectErrors } = require('../admin/fields');
const pageImages = require('../config/pageImages');
const { buildDocumentLibrary } = require('../services/documentLibrary');
const { buildTeamPresentation } = require('../services/team');
const { setPageSeo } = require('../services/seo');

// Icon shown on each home page activity card, by activity slug.
const ACTIVITY_ICONS = { 'in-service-training': 'users', cpd: 'growth', lms: 'screen' };

const notFound = () => createError(404, 'Page not found');

// Adds watch/thumbnail URLs for the click-to-play video previews.
function withVideoLinks(videos) {
  return videos.map(presentVideo).filter(Boolean);
}

function albumCards(albums) {
  return albums.map((a) => ({
    title: a.title,
    slug: a.slug,
    date: a.date,
    coverUrl: a.photos[0] ? a.photos[0].imageUrl : null,
    photoCount: a._count.photos,
  }));
}

// ─── Pages ────────────────────────────────────────────────────────────────────

// 16:9 photo for a card / section page: the uploaded image if there is one, otherwise the built-in
// photo for that key (null when neither exists). Uploaded images have no description field, so they
// are treated as decorative (alt ""); the built-in photos carry a real description.
const COVER_WIDTHS = [640, 960, 1280];
function coverImage(uploadedUrl, key) {
  if (uploadedUrl) {
    const cloud = uploadedUrl.includes('/image/upload/');
    const at = (w) => uploadedUrl.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_fill,g_auto,ar_16:9,w_${w}/`);
    return {
      src: cloud ? at(960) : uploadedUrl,
      srcset: cloud ? COVER_WIDTHS.map((w) => `${at(w)} ${w}w`).join(', ') : '',
      width: 960, height: 540, position: '50% 50%', alt: '',
    };
  }
  const builtIn = pageImages.focus[key];
  return builtIn ? { ...builtIn } : null;
}

// Cards for the project's areas of work: Curriculum, then each published activity.
function buildFocusItems(curriculum, activities) {
  return [
    {
      icon: 'book',
      title: curriculum.title,
      summary: curriculum.summary,
      href: '/curriculum',
      image: coverImage(curriculum.cardImage && curriculum.cardImage.url, 'curriculum'),
    },
    ...activities.map((a) => ({
      icon: ACTIVITY_ICONS[a.slug] || 'growth',
      title: a.title,
      summary: a.summary,
      href: `/activities/${a.slug}`,
      image: coverImage(a.coverImageUrl, a.slug),
    })),
  ];
}

// Responsive versions of an uploaded Cloudinary photo (Cloudinary resizes on the fly).
function cloudinarySrcset(url, widths) {
  return widths.map((w) => `${url.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${w}/`)} ${w}w`).join(', ');
}

// Home banner: the uploaded photo if there is one, otherwise the built-in workshop photo.
function homeHeroImage(page) {
  const uploaded = page.heroImage && page.heroImage.url ? page.heroImage : null;
  const alt = page.heroImageAlt || '';
  if (!uploaded) return { ...pageImages.homeDefault, alt };
  const isCloudinary = uploaded.url.includes('/image/upload/');
  return {
    srcset: isCloudinary ? cloudinarySrcset(uploaded.url, [480, 800, 1200, 1600]) : `${uploaded.url} ${uploaded.width || 1200}w`,
    fallback: isCloudinary ? uploaded.url.replace('/image/upload/', '/image/upload/f_auto,q_auto,c_limit,w_1200/') : uploaded.url,
    width: uploaded.width || 1200,
    height: uploaded.height || 1500,
    alt,
    position: '50% 40%',
    positionLg: '50% 40%',
  };
}

// A photo editable from Page content (image field + description field): the uploaded image if there is one,
// otherwise the built-in default. `crop` is an optional Cloudinary aspect ratio (e.g. '16:10') for uploads.
function homePhoto(page, { imageField, altField, fallback, widths, crop }) {
  const alt = page[altField] || '';
  const uploaded = page[imageField] && page[imageField].url ? page[imageField] : null;
  if (!uploaded) return { ...fallback, alt };
  const cloud = uploaded.url.includes('/image/upload/');
  const transform = crop ? `c_fill,g_auto,ar_${crop}` : 'c_limit';
  const at = (w) => uploaded.url.replace('/image/upload/', `/image/upload/f_auto,q_auto,${transform},w_${w}/`);
  const widest = widths[widths.length - 1];
  return {
    src: cloud ? at(widest) : uploaded.url,
    srcset: cloud ? widths.map((w) => `${at(w)} ${w}w`).join(', ') : '',
    width: crop ? widest : uploaded.width || fallback.width,
    height: crop ? Math.round((widest * crop.split(':')[1]) / crop.split(':')[0]) : uploaded.height || fallback.height,
    position: fallback.position,
    alt,
  };
}

// Photo beside the home statistics.
const homeStatsImage = (page) =>
  homePhoto(page, { imageField: 'statsImage', altField: 'statsImageAlt', fallback: pageImages.statsDefault, widths: [480, 800, 1140] });

// Banner under the "About the project" text (uploads are cropped to 16:10; CSS crops further on wide screens).
const homeIntroImage = (page) =>
  homePhoto(page, { imageField: 'introImage', altField: 'introImageAlt', fallback: pageImages.introDefault, widths: [640, 1000, 1448], crop: '16:10' });

// Home shows a slideshow of workshop photos where no photo has been uploaded for the spot (Admin -> Page content -> Home);
// an uploaded photo always wins and is shown on its own.
const hasUpload = (page, field) => Boolean(page[field] && page[field].url);

// Home gallery teasers: albums and videos share one tile style. Up to two albums, then videos to fill three
// tiles, so a published video always gets a place; with no videos, up to three albums.
function buildMediaTiles(albums, videos) {
  const albumLimit = videos.length ? 2 : 3;
  const tiles = albums.slice(0, albumLimit).map((a) => ({
    isVideo: false,
    title: a.title,
    href: `/gallery/${a.slug}`,
    imageUrl: a.coverUrl,
    date: a.date,
    photoCount: a.photoCount,
  }));
  videos.slice(0, 3 - tiles.length).forEach((v) => tiles.push({
    isVideo: true,
    title: v.title,
    href: '/gallery#videos',
    imageUrl: v.thumbnailUrl,
    isPortrait: v.isPortrait,
    date: v.date,
    durationLabel: v.durationLabel,
  }));
  return tiles;
}

// Announcement cards: a "New" flag for notices from the last two weeks, and a one-paragraph teaser for cards
// that should not show the whole notice. `showFull` is decided in the template (a lone, short notice shows all).
const NEW_NOTICE_MS = 14 * 24 * 60 * 60 * 1000;
function noticeCards(items) {
  const now = Date.now();
  return items.map((n) => {
    const paragraphs = String(n.body || '').split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
    const teaser = paragraphs[0] || '';
    return {
      ...n,
      isNew: now - new Date(n.publishedAt).getTime() < NEW_NOTICE_MS,
      teaser,
      hasMore: paragraphs.length > 1 || teaser.length > 240,
      isLong: String(n.body || '').length > 900,
    };
  });
}

async function home(req, res) {
  const { page, curriculum, activities, announcements, albums, videos = [], videoCount } = await content.getHomePage();
  const firstActivity = activities[0];
  const heroImage = homeHeroImage(page);
  setPageSeo(req, res, { path: '/', page });
  res.render('public/home', {
    isHome: true,
    page,
    heroImage, // the share preview for Home stays the branded logo image (og-image.jpg)
    statsImage: hasUpload(page, 'statsImage') ? homeStatsImage(page) : null,
    statsSlides: hasUpload(page, 'statsImage') ? null : pageImages.slideshows.portrait,
    introImage: hasUpload(page, 'introImage') ? homeIntroImage(page) : null,
    introSlides: hasUpload(page, 'introImage') ? null : pageImages.slideshows.landscape,
    focusItems: buildFocusItems(curriculum, activities),
    announcements: noticeCards(announcements),
    mediaTiles: buildMediaTiles(albumCards(albums), withVideoLinks(videos)),
    videoCount,
    activitiesHref: firstActivity ? `/activities/${firstActivity.slug}` : '/curriculum',
  });
}

async function about(req, res) {
  const [page, curriculum, activities] = await Promise.all([
    content.getPage('about'),
    content.getPage('curriculum'),
    content.getActivities(),
  ]);
  const focusItems = buildFocusItems(curriculum, activities);
  setPageSeo(req, res, { path: '/about', page, image: pageImages.about.fallback, imageAlt: pageImages.about.alt });
  res.render('public/about', {
    title: page.title,
    metaDescription: page.summary,
    metaImage: pageImages.about.fallback,
    heroImage: pageImages.about,
    page,
    focusItems,
    gallerySlides: pageImages.slideshows.landscape,
  });
}

async function team(req, res) {
  const [page, members] = await Promise.all([content.getPage('team'), content.getTeam()]);
  setPageSeo(req, res, { path: '/team', page });
  res.render('public/team', { title: page.title, metaDescription: page.summary, page, team: buildTeamPresentation(members) });
}

async function curriculum(req, res) {
  const [page, documentGroups] = await Promise.all([content.getPage('curriculum'), content.getDocuments(['PUBLIC'])]);
  const library = buildDocumentLibrary(documentGroups, req.query);
  const heroImage = coverImage(page.cardImage && page.cardImage.url, 'curriculum');
  setPageSeo(req, res, { path: '/curriculum', page, noindex: library.isFiltered, image: heroImage && heroImage.src });
  res.render('public/curriculum', {
    title: page.title, metaDescription: page.summary, page,
    library, heroImage,
  });
}

async function activity(req, res) {
  const item = await content.getActivity(req.params.slug);
  if (!item) throw notFound();
  const [activities, resourceDocuments] = await Promise.all([
    content.getActivities(), content.getActivityDocuments(item.slug),
  ]);
  const heroImage = coverImage(item.coverImageUrl, item.slug);
  setPageSeo(req, res, { path: `/activities/${encodeURIComponent(item.slug)}`, page: item, image: heroImage && heroImage.src });
  res.render('public/activity', {
    title: item.title,
    metaDescription: item.summary,
    metaImage: heroImage && heroImage.src,
    heroImage,
    activity: item,
    resourceDocuments,
    albums: albumCards(item.albums),
    videos: withVideoLinks(item.videos),
    otherActivities: activities.filter((a) => a.slug !== item.slug),
  });
}

async function gallery(req, res) {
  const [page, { albums, videos }] = await Promise.all([content.getPage('gallery'), content.getGallery()]);
  const cards = albumCards(albums);
  setPageSeo(req, res, { path: '/gallery', page, image: cards[0]?.coverUrl });
  res.render('public/gallery', {
    title: page.title,
    metaDescription: page.summary,
    metaImage: cards[0] && cards[0].coverUrl,
    page,
    albums: cards,
    videos: withVideoLinks(videos),
  });
}

async function album(req, res) {
  const item = await content.getAlbum(req.params.slug);
  if (!item) throw notFound();
  setPageSeo(req, res, {
    path: `/gallery/${encodeURIComponent(item.slug)}`, page: item,
    description: item.description || `Photos: ${item.title}`, image: item.photos[0]?.imageUrl,
    imageAlt: item.photos[0]?.caption, parent: { name: 'Pictures and Videos', path: '/gallery' },
  });
  res.render('public/album', {
    title: item.title,
    metaDescription: item.description || `Photos: ${item.title}`,
    metaImage: item.photos[0] && item.photos[0].imageUrl,
    album: {
      ...item,
      // Feature the cover above the remaining images in a larger photo collection.
      photos: item.photos.map((photo, index) => ({ ...photo, isWide: item.photos.length > 2 && index === 0 })),
    },
  });
}

// ─── Contact ──────────────────────────────────────────────────────────────────

const contactRules = [
  body('name').trim().notEmpty().withMessage('Enter your name.').bail().isLength({ max: 120 }).withMessage('Name must be 120 characters or fewer.'),
  body('email').trim().notEmpty().withMessage('Enter your email address.').bail().isEmail().withMessage('Enter a valid email address.').bail().isLength({ max: 254 }),
  body('phone').trim().optional({ values: 'falsy' }).isLength({ max: 40 }).withMessage('Phone number must be 40 characters or fewer.'),
  body('subject').trim().notEmpty().withMessage('Enter a subject.').bail().isLength({ max: 150 }).withMessage('Subject must be 150 characters or fewer.'),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Enter your message.')
    .bail()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Message must be between 10 and 5,000 characters.'),
];

async function renderContact(req, res, { values = {}, errors = {}, status = 200, partnership = false } = {}) {
  const page = await content.getPage('contact');
  if (partnership) values = { subject: page.partnershipSubject || '' };
  setPageSeo(req, res, { path: '/contact', page, image: pageImages.contact.fallback });
  res.status(status).render('public/contact', {
    title: page.title,
    metaDescription: page.summary,
    metaImage: pageImages.contact.fallback,
    heroImage: pageImages.contact,
    page,
    values,
    errors,
  });
}

async function showContact(req, res) {
  // Recognize a fixed enquiry type; never copy arbitrary query text into fields.
  await renderContact(req, res, { partnership: req.query.enquiry === 'partnership' });
}

// Strip line breaks so user input can't add lines to email headers.
const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

async function submitContact(req, res) {
  // Honeypot: real visitors never see or fill the "website" field.
  if (req.body.website) {
    req.flash('success', 'Thank you. Your message has been sent.');
    return res.redirect('/contact');
  }

  const errors = collectErrors(req);
  if (Object.keys(errors).length) return renderContact(req, res, { values: req.body, errors, status: 422 });

  const site = await content.getSite();
  const to = (process.env.CONTACT_EMAIL || site.contact.email || '').trim();
  const { name, email, phone, subject, message } = req.body;

  try {
    await sendMail({
      to,
      replyTo: { name: oneLine(name), address: email },
      ...contactEmail({ siteName: site.shortName, name, email, phone, subject, message }),
    });
  } catch (err) {
    logMailError('contact form', err);
    return renderContact(req, res, {
      values: req.body,
      errors: { form: `Sorry, your message could not be sent right now. Please try again later${to ? ` or email us at ${to}` : ''}.` },
      status: 503,
    });
  }

  req.flash('success', 'Thank you. Your message has been sent and we will reply as soon as possible.');
  res.redirect('/contact');
}

module.exports = {
  buildMediaTiles,
  noticeCards,
  home,
  about,
  team,
  curriculum,
  activity,
  gallery,
  album,
  contactRules,
  showContact,
  submitContact,
};
