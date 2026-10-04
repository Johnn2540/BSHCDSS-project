const test = require('node:test');
const assert = require('node:assert/strict');

let currentDocument;
const dbPath = require.resolve('../src/lib/db');
const storagePath = require.resolve('../src/services/storage');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  prisma: { document: { findUnique: async () => currentDocument } },
} };
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: {
  documentDownload: () => ({ path: 'private/document.doc' }),
} };
const { download } = require('../src/controllers/documentsController');

function request(role) {
  return { params: { id: 'test-document' }, user: role ? { role } : undefined,
    session: {}, originalUrl: '/documents/test-document/download', flash() {} };
}
function response() {
  return { headers: {}, set(name, value) { this.headers[name] = value; },
    download(path, name) { this.sent = { path, name }; }, redirect(url) { this.redirected = url; } };
}
function document(audience, isPublished) {
  currentDocument = { id: 'test-document', filePublicId: 'private:documents/test.doc',
    fileName: 'original.doc', audience, isPublished };
}

test('published public documents download with the original filename and no shared caching', async () => {
  document('PUBLIC', true);
  const res = response();
  await download(request(), res);
  assert.equal(res.sent.name, 'original.doc');
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('anonymous visitors must log in for tutor documents', async () => {
  document('TUTORS', true);
  const req = request();
  const res = response();
  await download(req, res);
  assert.equal(res.redirected, '/login');
  assert.equal(req.session.returnTo, req.originalUrl);
  assert.equal(res.sent, undefined);
});

test('tutors can download published tutor resources', async () => {
  document('TUTORS', true);
  const res = response();
  await download(request('TUTOR'), res);
  assert.ok(res.sent);
});

test('unpublishing a document prevents anonymous and tutor downloads', async () => {
  document('PUBLIC', false);
  await assert.rejects(download(request(), response()), { status: 404 });
  await assert.rejects(download(request('TUTOR'), response()), { status: 404 });
});

test('admins retain access to unpublished resources; unknown documents return 404', async () => {
  document('TUTORS', false);
  const res = response();
  await download(request('ADMIN'), res);
  assert.ok(res.sent);
  currentDocument = null;
  await assert.rejects(download(request('ADMIN'), response()), { status: 404 });
});
