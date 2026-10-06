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

// Cards for the project's areas of work: Curriculum, then each published activity.
function buildFocusItems(curriculum, activities) {
  return [
    { icon: 'book', title: curriculum.title, summary: curriculum.summary, href: '/curriculum' },
    ...activities.map((a) => ({
      icon: ACTIVITY_ICONS[a.slug] || 'growth',
      title: a.title,
      summary: a.summary,
      href: `/activities/${a.slug}`,
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

async function home(req, res) {
  const { page, curriculum, activities, announcements, albums, videoCount } = await content.getHomePage();
  const firstActivity = activities[0];
  const heroImage = homeHeroImage(page);
  setPageSeo(req, res, { path: '/', page });
  res.render('public/home', {
    isHome: true,
    page,
    heroImage, // the share preview for Home stays the branded logo image (og-image.jpg)
    focusItems: buildFocusItems(curriculum, activities),
    announcements,
    albums: albumCards(albums),
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
  setPageSeo(req, res, { path: '/curriculum', page, noindex: library.isFiltered });
  res.render('public/curriculum', {
    title: page.title, metaDescription: page.summary, page,
    library,
  });
}

async function activity(req, res) {
  const item = await content.getActivity(req.params.slug);
  if (!item) throw notFound();
  const [activities, resourceDocuments] = await Promise.all([
    content.getActivities(), content.getActivityDocuments(item.slug),
  ]);
  setPageSeo(req, res, { path: `/activities/${encodeURIComponent(item.slug)}`, page: item, image: item.coverImageUrl });
  res.render('public/activity', {
    title: item.title,
    metaDescription: item.summary,
    metaImage: item.coverImageUrl,
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

async function renderContact(req, res, { values = {}, errors = {}, status = 200 } = {}) {
  const page = await content.getPage('contact');
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
  await renderContact(req, res);
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
