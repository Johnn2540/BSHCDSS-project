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
const users = Object.fromEntries(['tutor', 'admin', 'pending', 'suspended'].map((key) => [key, {
  id: key, name: key === 'admin' ? 'Project Administrator' : 'Example Tutor', email: `${key}@example.test`,
  passwordHash: hash, role: key === 'admin' ? 'ADMIN' : 'TUTOR', status: key === 'pending' ? 'PENDING' : key === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
}]));
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
const state = { documents: initialDocuments.map((item) => ({ ...item })), events: [], users, failUpload: false };
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
    update: async ({ where, data }) => { Object.assign(users[where.id], data); return { ...users[where.id] }; },
  },
  pageContent: { findUnique: async () => null },
  passwordResetToken: { deleteMany: async () => { state.events.push('revoke-tokens'); return { count: 0 }; } },
  $transaction: async (operations) => Promise.all(operations),
};
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
  app.use((req, res, next) => {
    res.locals.site = { shortName: 'BSHCDSS', fullName: 'Building Skills for Human Capacity Development in South Sudan', logoUrl: '/images/logo-placeholder.svg', contact: { email: 'kussdproject@gmail.com' } };
    res.locals.navigation = []; res.locals.currentPath = req.path; res.locals.baseUrl = 'http://localhost';
    next();
  });
  app.use('/', require('../../src/routes/auth'));
  app.use('/tutor', require('../../src/routes/tutor'));
  app.use('/admin', require('../../src/routes/admin'));
  app.get('/documents/:id/download', require('../../src/controllers/documentsController').download);
  app.use((req, res) => res.status(404).send('Not found'));
  app.use(require('../../src/middleware/errorHandlers').errorHandler);
  return app;
}

function resetFixture() {
  state.documents = initialDocuments.map((item) => ({ ...item })); state.events = []; state.failUpload = false;
  for (const user of Object.values(users)) user.passwordHash = hash;
  content.clearCache();
}
module.exports = { createPortalFixture, resetFixture, state, password, content };
