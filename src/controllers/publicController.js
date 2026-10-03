const createError = require('http-errors');
const { body } = require('express-validator');

const content = require('../services/content');
const { parseVideoUrl } = require('../services/video');
const { sendMail } = require('../services/mailer');
const { collectErrors } = require('../admin/fields');
const pageImages = require('../config/pageImages');

// Icon shown on each home page activity card, by activity slug.
const ACTIVITY_ICONS = { 'in-service-training': 'users', cpd: 'growth', lms: 'screen' };

const notFound = () => createError(404, 'Page not found');

// Adds watch/thumbnail URLs for the click-to-play video previews.
function withVideoLinks(videos) {
  return videos.map((v) => {
    const parsed = parseVideoUrl(v.embedUrl) || {};
    const watchUrl =
      parsed.provider === 'YOUTUBE'
        ? `https://www.youtube.com/watch?v=${parsed.id}`
        : parsed.provider === 'VIMEO'
          ? `https://vimeo.com/${parsed.id}`
          : v.embedUrl;
    return { ...v, watchUrl, thumbnailUrl: parsed.thumbnailUrl || null };
  });
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

async function home(req, res) {
  const { page, curriculum, activities } = await content.getHomePage();
  const firstActivity = activities[0];
  res.render('public/home', {
    isHome: true,
    page,
    focusItems: buildFocusItems(curriculum, activities),
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
  res.render('public/team', { title: page.title, metaDescription: page.summary, page, members });
}

async function curriculum(req, res) {
  const [page, documentGroups] = await Promise.all([content.getPage('curriculum'), content.getDocuments(['PUBLIC'])]);
  res.render('public/curriculum', { title: page.title, metaDescription: page.summary, page, documentGroups });
}

async function activity(req, res) {
  const item = await content.getActivity(req.params.slug);
  if (!item) throw notFound();
  const activities = await content.getActivities();
  res.render('public/activity', {
    title: item.title,
    metaDescription: item.summary,
    metaImage: item.coverImageUrl,
    activity: item,
    albums: albumCards(item.albums),
    videos: withVideoLinks(item.videos),
    otherActivities: activities.filter((a) => a.slug !== item.slug),
  });
}

async function gallery(req, res) {
  const [page, { albums, videos }] = await Promise.all([content.getPage('gallery'), content.getGallery()]);
  const cards = albumCards(albums);
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
  res.render('public/album', {
    title: item.title,
    metaDescription: item.description || `Photos: ${item.title}`,
    metaImage: item.photos[0] && item.photos[0].imageUrl,
    album: item,
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
  const to = process.env.CONTACT_EMAIL || site.contact.email;
  const { name, email, phone, subject, message } = req.body;

  try {
    await sendMail({
      to,
      replyTo: { name: oneLine(name), address: email },
      subject: `[Website] ${oneLine(subject)}`,
      text:
        `New message from the ${site.shortName} website contact form.\n\n` +
        `Name: ${oneLine(name)}\nEmail: ${email}\n${phone ? `Phone: ${oneLine(phone)}\n` : ''}` +
        `Subject: ${oneLine(subject)}\n\n${message}\n`,
    });
  } catch (err) {
    console.error('Contact form email failed:', err);
    return renderContact(req, res, {
      values: req.body,
      errors: { form: `Sorry, your message could not be sent right now. Please try again later or email us at ${site.contact.email}.` },
      status: 503,
    });
  }

  req.flash('success', 'Thank you. Your message has been sent and we will reply as soon as possible.');
  res.redirect('/contact');
}

// ─── SEO ──────────────────────────────────────────────────────────────────────

function baseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function robots(req, res) {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Disallow: /admin',
      'Disallow: /tutor',
      'Disallow: /login',
      'Disallow: /forgot-password',
      'Disallow: /reset-password',
      'Disallow: /documents/',
      '',
      `Sitemap: ${baseUrl(req)}/sitemap.xml`,
      '',
    ].join('\n')
  );
}

const xmlEscape = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

async function sitemap(req, res) {
  const base = baseUrl(req);
  const entries = await content.getSitemapEntries();
  const urls = entries
    .map(
      (e) =>
        `  <url><loc>${xmlEscape(base + e.loc)}</loc>${e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`
    )
    .join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
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
  robots,
  sitemap,
};
