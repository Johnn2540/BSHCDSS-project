// Isolated public-site fixture: no real database writes, accounts or outgoing mail.
const path = require('node:path');
const express = require('express');
const { engine } = require('express-handlebars');

function announcement(id, overrides = {}) {
  const past = new Date(Date.now() - 60000);
  return { id, title: 'Project notice ' + id, body: 'A public project update.\n\nFurther information for participants.',
    audience: 'PUBLIC', isPublished: true, publishedAt: past, updatedAt: past, ...overrides };
}
const state = { announcements: [], reads: 0, failCounts: false };
function reset() {
  state.reads = 0; state.failCounts = false;
  state.announcements = [
    announcement('notice-one'), announcement('notice-two'),
    announcement('private', { audience: 'TUTORS', title: 'Private tutor notice' }),
    announcement('draft', { isPublished: false, title: 'Unpublished draft' }),
    announcement('future', { publishedAt: new Date(Date.now() + 86400000), title: 'Scheduled future notice' }),
  ];
}
reset();
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((clause) => matches(row, clause));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (value.lte !== undefined && !(row[key] <= value.lte)) return false;
      if (value.gt !== undefined && !(row[key] > value.gt)) return false;
      return true;
    }
    return row[key] === value;
  });
}
const prisma = {
  pageContent: { findUnique: async () => null },
  partner: { findMany: async () => [] },
  activity: { findMany: async () => [
    { title: 'In-Service Teacher Training', slug: 'in-service-training' },
    { title: 'Continuous Professional Development', slug: 'cpd' },
    { title: 'Digital Learning Management System', slug: 'lms' },
  ] },
  album: { findMany: async () => [] },
  video: { count: async () => 0 },
  announcement: {
    findMany: async (query = {}) => {
      state.reads += 1;
      const rows = state.announcements.filter((row) => matches(row, query.where));
      rows.sort((a, b) => query.orderBy?.publishedAt ? b.publishedAt - a.publishedAt : b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
      return rows.slice(query.skip || 0, (query.skip || 0) + (query.take || rows.length))
        .map((row) => query.select ? Object.fromEntries(Object.keys(query.select).map((key) => [key, row[key]])) : { ...row });
    },
    count: async ({ where }) => {
      if (state.failCounts) throw new Error('Fixture notification count unavailable');
      return state.announcements.filter((row) => matches(row, where)).length;
    },
  },
  $transaction: async (operations) => Promise.all(operations),
};
const dbPath = require.resolve('../../src/lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma } };
const helpers = require('../../src/helpers/handlebars');
const security = require('../../src/middleware/security');
const content = require('../../src/services/content');
const notifications = require('../../src/controllers/notificationsController');
const publicController = require('../../src/controllers/publicController');

function createFixture() {
  const app = express();
  app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', layoutsDir: path.join(__dirname, '../../src/views/layouts'), partialsDir: path.join(__dirname, '../../src/views/partials'), helpers }));
  app.set('view engine', 'hbs'); app.set('views', path.join(__dirname, '../../src/views'));
  app.use(security.cspNonce, security.helmet);
  const seoMiddleware = require('../../src/middleware/seo');
  app.use(seoMiddleware.indexingRules, seoMiddleware.canonicalPaths);
  app.use(express.static(path.join(__dirname, '../../public')));
  app.get('/api/public/notifications', notifications.feed);
  app.use(require('../../src/middleware/siteLocals'));
  app.get('/', publicController.home);
  app.get('/about', publicController.about);
  app.get('/announcements', notifications.page);
  app.use(require('../../src/middleware/errorHandlers').errorHandler);
  return app;
}
module.exports = { createFixture, state, reset, announcement, content, prisma };
