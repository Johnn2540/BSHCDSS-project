const createError = require('http-errors');
const notifications = require('../services/notifications');
const content = require('../services/content');
const { setPageSeo } = require('../services/seo');

async function feed(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex');
  let query;
  try { query = notifications.parseQuery(req.query); }
  catch { return res.status(400).json({ error: 'Invalid notification request.' }); }
  try { return res.json(await notifications.getPublicNotifications(query)); }
  catch (error) {
    console.error('Public notifications could not be loaded:', error.message);
    return res.status(503).json({ error: 'Notifications are temporarily unavailable.' });
  }
}

async function page(req, res) {
  let query;
  try { query = notifications.parseQuery({ page: req.query.page }); }
  catch { throw createError(400, 'Choose a valid announcements page.'); }
  const [pageContent, feed] = await Promise.all([
    content.getPage('announcements'), notifications.getPublicNotifications(query),
  ]);
  if (query.page > 1 && !feed.items.length) throw createError(404, 'That announcements page could not be found.');
  setPageSeo(req, res, { path: '/announcements', page: pageContent, pageNumber: query.page });
  res.render('public/announcements', {
    title: pageContent.title, metaDescription: pageContent.summary, page: pageContent, feed,
    previousPage: query.page > 1 ? query.page - 1 : null,
    nextPage: feed.hasMore ? query.page + 1 : null,
  });
}

module.exports = { feed, page };
