const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let item, events, fails;
const url = 'https://res.cloudinary.com/test/video/upload/v1/bshcdss/videos/session.mp4';
const asset = 'bshcdss/videos/session';
const dbPath = require.resolve('../src/lib/db');
const storagePath = require.resolve('../src/services/storage');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: {
  activity: { findMany: async () => [] },
  video: {
    findUnique: async () => ({ ...item }),
    update: async ({ data }) => { events.push('save'); if (fails) throw new Error('Save failure'); item = { ...item, ...data }; return item; },
    delete: async () => { events.push('delete-row'); return item; },
  },
} } };
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: {
  destroyFile: async (id, kind) => { assert.equal(kind, 'video'); events.push('delete-asset:' + id); },
} };
const resource = require('../src/admin/resources').find((resource) => resource.key === 'videos');
const { crudRouter } = require('../src/admin/crud');

test('admin video edits retain owned assets and cleanup runs only after database changes', async (t) => {
  const app = express(); app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => { req.flash = () => {}; res.render = (view, data) => res.json({ errors: data.errors, values: data.values }); next(); });
  app.use('/admin/videos', crudRouter(resource));
  app.use((err, req, res, next) => res.status(500).json({ error: 'Save failed' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/admin/videos/video';
  function reset() { events = []; fails = false; item = { id: 'video', title: 'Session', embedUrl: url, provider: 'CLOUDINARY', videoPublicId: asset, width: 478, height: 850, duration: 40.874667 }; }
  function update(source = url) { return fetch(base, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ title: 'Edited session', embedUrl: source, description: 'Edited description', displayOrder: '1', isPublished: 'on' }) }); }
  await t.test('editing the caption keeps the Cloudinary source and metadata', async () => {
    reset(); assert.equal((await update()).status, 302);
    assert.equal(item.title, 'Edited session'); assert.equal(item.videoPublicId, asset);
    assert.equal(item.width, 478); assert.equal(item.duration, 40.874667); assert.deepEqual(events, ['save']);
  });
  await t.test('changing the source clears obsolete metadata before deleting the old managed video', async () => {
    reset(); assert.equal((await update('https://youtu.be/dQw4w9WgXcQ')).status, 302);
    assert.equal(item.provider, 'YOUTUBE'); assert.equal(item.videoPublicId, null); assert.equal(item.duration, null);
    assert.deepEqual(events, ['save', 'delete-asset:' + asset]);
  });
  await t.test('a changed delivery URL for the same asset retains its ownership and metadata', async () => {
    reset(); assert.equal((await update(url.replace('/upload/', '/upload/q_auto/'))).status, 302);
    assert.equal(item.videoPublicId, asset); assert.equal(item.duration, 40.874667); assert.deepEqual(events, ['save']);
  });
  await t.test('failed saves retain the current video asset', async () => {
    reset(); fails = true; assert.equal((await update('https://vimeo.com/123456789')).status, 500);
    assert.equal(item.videoPublicId, asset); assert.deepEqual(events, ['save']);
  });
  await t.test('invalid links cannot save or delete assets', async () => {
    reset(); const response = await update('https://evil.example/video.mp4'); assert.equal(response.status, 422);
    assert.ok((await response.json()).errors.embedUrl); assert.deepEqual(events, []);
  });
  await t.test('deleting a managed video removes the row before the asset', async () => {
    reset(); assert.equal((await fetch(base + '/delete', { method: 'POST', redirect: 'manual' })).status, 302);
    assert.deepEqual(events, ['delete-row', 'delete-asset:' + asset]);
  });
  await t.test('deleting an external link leaves unowned media alone', async () => {
    reset(); item.videoPublicId = null; assert.equal((await fetch(base + '/delete', { method: 'POST', redirect: 'manual' })).status, 302);
    assert.deepEqual(events, ['delete-row']);
  });
});

test('Cloudinary uploads and cleanup use the video resource type', async () => {
  const cloudPath = require.resolve('cloudinary');
  let uploadOptions, cleanupOptions;
  require.cache[cloudPath] = { id: cloudPath, filename: cloudPath, loaded: true, exports: { v2: { config() {}, uploader: {
    upload_stream(options, callback) { uploadOptions = options; return { end: () => callback(null, { secure_url: url, public_id: asset, width: 478, height: 850, duration: 40.874667, bytes: 100 }) }; },
    async destroy(id, options) { assert.equal(id, asset); cleanupOptions = options; },
  } } } };
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[key] = 'test-only';
  delete require.cache[storagePath];
  const storage = require('../src/services/storage');
  const stored = await storage.uploadFile({ buffer: Buffer.from('fixture') }, { folder: 'videos', kind: 'video' });
  assert.deepEqual(uploadOptions, { folder: 'bshcdss/videos', resource_type: 'video', overwrite: false });
  assert.equal(stored.duration, 40.874667); assert.equal(stored.height, 850);
  await storage.destroyFile(asset, 'video'); assert.deepEqual(cleanupOptions, { resource_type: 'video', invalidate: true });
});
