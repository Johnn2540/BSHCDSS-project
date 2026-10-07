// Isolated test harness: fake accounts, fake persistence and fake file storage.
// It is used only by test scripts, never by the application or production routes.
const path = require('node:path');
const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const { engine } = require('express-handlebars');
process.env.SESSION_SECRET = 'isolated-tutor-portal-test-secret-only';
const password = 'fixture-password-for-testing';
const hash = bcrypt.hashSync(password, 4);
const initialUsers = Object.fromEntries(['tutor', 'admin', 'pending', 'suspended', 'delegated', 'delegated-peer'].map((key) => [key, {
  id: key, name: key === 'admin' ? 'Project Administrator' : 'Example Tutor', email: `${key}@example.test`,
  passwordHash: hash, role: key === 'admin' ? 'ADMIN' : 'TUTOR', status: key === 'pending' ? 'PENDING' : key === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
  canManageContent: key.startsWith('delegated'), createdAt: new Date('2026-10-05T09:00:00Z'), lastLoginAt: null,
}]));
const users = Object.fromEntries(Object.entries(initialUsers).map(([key, user]) => [key, { ...user }]));
function document(id, title, portalSection, audience = 'TUTORS', isPublished = true, category = 'Project resources') {
  return { id, title, portalSection, audience, isPublished, category, description: 'Published project resource.',
    fileName: id + '.pdf', mimeType: 'application/pdf', fileSize: 1024, filePublicId: 'fixture-private:' + id,
    fileUrl: 'https://private-storage.example.test/' + id, updatedAt: new Date('2026-10-05T09:00:00Z'), createdAt: new Date('2026-10-05T09:00:00Z') };
}
const initialDocuments = [
  document('curriculum', 'Curriculum guidance', 'DOCUMENTS', 'PUBLIC', true, 'Curriculum'),
  document('guide', 'Tutor guide', 'DOCUMENTS'),
  document('report', 'Training progress report', 'REPORTS'),
  document('public-report', 'Public project report', 'REPORTS', 'PUBLIC'),
  document('draft', 'Unpublished report', 'REPORTS', 'TUTORS', false),
  document('plan', 'Quarterly work plan', 'PLANS_ACTIVITIES'),
];
const state = { documents: initialDocuments.map((item) => ({ ...item })), events: [], users, failUpload: false, userWrites: [], accountManagementReads: 0, beforeUserUpdate: null };
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object'
    ? value.in ? value.in.includes(row[key]) : value.not !== undefined ? row[key] !== value.not : row[key] === value
    : row[key] === value);
}
function select(row, fields) { return fields ? Object.fromEntries(Object.keys(fields).filter((key) => fields[key]).map((key) => [key, row[key]])) : { ...row }; }
const prisma = {
  document: {
    findMany: async (query = {}) => {
      let rows = state.documents.filter((row) => matches(row, query.where)).sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
      if (query.distinct) rows = rows.filter((row, index, all) => all.findIndex((entry) => entry.category === row.category) === index);
      if (query.skip || query.take) rows = rows.slice(query.skip || 0, (query.skip || 0) + (query.take || rows.length));
      return rows.map((row) => select(row, query.select));
    },
    findFirst: async ({ where, select: fields }) => { const row = state.documents.find((row) => matches(row, where)); return row ? select(row, fields) : null; },
    findUnique: async ({ where, select: fields }) => { const row = state.documents.find((row) => row.id === where.id); return row ? select(row, fields) : null; },
    count: async (query = {}) => state.documents.filter((row) => matches(row, query.where)).length,
    create: async ({ data }) => { const row = { ...document('created-' + state.documents.length, data.title, data.portalSection), ...data }; state.documents.push(row); return { ...row }; },
    update: async ({ where, data }) => { const row = state.documents.find((row) => row.id === where.id); Object.assign(row, data, { updatedAt: new Date() }); state.events.push('save'); return { ...row }; },
    delete: async ({ where }) => { const index = state.documents.findIndex((row) => row.id === where.id); return state.documents.splice(index, 1)[0]; },
  },
  user: {
    findUnique: async ({ where, select: fields }) => { const row = where.id ? users[where.id] : Object.values(users).find((user) => user.email === where.email); return row ? select(row, fields) : null; },
    findFirst: async ({ where, select: fields }) => { state.accountManagementReads++; const row = Object.values(users).find(user => matches(user, where)); return row ? select(row, fields) : null; },
    findMany: async (query = {}) => {
      state.accountManagementReads++;
      const rows = Object.values(users).filter(user => matches(user, query.where));
      return rows.slice(query.skip || 0, (query.skip || 0) + (query.take || rows.length)).map(row => select(row, query.select));
    },
    count: async (query = {}) => { state.accountManagementReads++; return Object.values(users).filter(user => matches(user, query.where)).length; },
    groupBy: async (query = {}) => {
      state.accountManagementReads++;
      const counts = {};
      for (const user of Object.values(users).filter(user => matches(user, query.where))) counts[user.status] = (counts[user.status] || 0) + 1;
      return Object.entries(counts).map(([status, count]) => ({ status, _count: { _all: count } }));
    },
    create: async ({ data }) => {
      const row = { ...initialUsers.tutor, id: 'created-' + Object.keys(users).length, canManageContent: false, ...data };
      users[row.id] = row; state.userWrites.push({ id: row.id, data: { ...data } }); return { ...row };
    },
    update: async ({ where, data }) => { Object.assign(users[where.id], data); state.userWrites.push({ id: where.id, data: { ...data } }); return { ...users[where.id] }; },
    updateMany: async ({ where, data }) => {
      if (state.beforeUserUpdate) { const hook = state.beforeUserUpdate; state.beforeUserUpdate = null; hook(); }
      const rows = Object.values(users).filter(user => matches(user, where));
      for (const row of rows) { Object.assign(row, data); state.userWrites.push({ id: row.id, data: { ...data } }); }
      return { count: rows.length };
    },
    delete: async ({ where }) => { const row = users[where.id]; delete users[where.id]; state.userWrites.push({ id: where.id, deleted: true }); return row; },
  },
  pageContent: { findUnique: async () => null, findMany: async () => [] },
  announcement: { findMany: async () => [], count: async () => 0 },
  passwordResetToken: { deleteMany: async () => { state.events.push('revoke-tokens'); return { count: 0 }; } },
  $transaction: async (operations) => Promise.all(operations),
};
for (const model of ['teamMember', 'activity', 'album', 'photo', 'video', 'partner']) {
  prisma[model] = { count: async () => 0, findMany: async () => [] };
}
const dbPath = require.resolve('../../src/lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma,
  pool: { query: async (sql, params) => { state.events.push({ sql, params }); return { rows: [], rowCount: 0 }; } },
} };
const storagePath = require.resolve('../../src/services/storage');
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: {
  uploadFile: async (file) => { if (state.failUpload) throw new Error('Fixture storage failure'); state.events.push('upload'); return { url: 'https://private-storage.example.test/new', publicId: 'fixture-private:new', bytes: file.size }; },
  destroyFile: async (id) => state.events.push('delete-file:' + id),
  documentDownload: (id) => ({ url: 'https://download.example.test/' + encodeURIComponent(id) }),
} };
const helpers = require('../../src/helpers/handlebars');
const security = require('../../src/middleware/security');
const { loadUser } = require('../../src/middleware/auth');
const flash = require('../../src/middleware/flash');
const content = require('../../src/services/content');

function createPortalFixture() {
  const app = express();
  app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', layoutsDir: path.join(__dirname, '../../src/views/layouts'), partialsDir: path.join(__dirname, '../../src/views/partials'), helpers }));
  app.set('view engine', 'hbs'); app.set('views', path.join(__dirname, '../../src/views'));
  app.use(security.cspNonce, security.helmet);
  app.use(express.static(path.join(__dirname, '../../public')));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
  app.use(flash, loadUser, security.privatePages, security.csrfProtection, security.csrfTokenForUsers);
  app.use(async (req, res, next) => {
    res.locals.site = await content.getSite();
    res.locals.navigation = []; res.locals.currentPath = req.path; res.locals.baseUrl = 'http://localhost';
    next();
  });
  app.use('/', require('../../src/routes/auth'));
  app.get('/api/public/notifications', require('../../src/controllers/notificationsController').feed);
  app.use('/tutor', require('../../src/routes/tutor'));
  app.use('/admin', require('../../src/routes/admin'));
  app.get('/documents/:id/download', require('../../src/controllers/documentsController').download);
  app.use((req, res) => res.status(404).send('Not found'));
  app.use(require('../../src/middleware/errorHandlers').errorHandler);
  return app;
}

function resetFixture() {
  state.documents = initialDocuments.map((item) => ({ ...item })); state.events = []; state.failUpload = false;
  for (const key of Object.keys(users)) delete users[key];
  for (const [key, user] of Object.entries(initialUsers)) users[key] = { ...user };
  state.userWrites = []; state.accountManagementReads = 0; state.beforeUserUpdate = null;
  content.clearCache();
}
module.exports = { createPortalFixture, resetFixture, state, password, content, prisma };
