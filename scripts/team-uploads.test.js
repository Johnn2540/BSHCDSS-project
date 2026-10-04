const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// Exercise the real form validation and multipart router without touching live profiles.
let member, events, uploadFails, saveFails, referenceTaken, savedData;
const oldUrl = 'https://res.cloudinary.com/test/image/upload/v1/bshcdss/team/old.png';
const oldId = 'bshcdss/team/old';
const newUrl = 'https://res.cloudinary.com/test/image/upload/v2/bshcdss/team/new.png';
const newId = 'bshcdss/team/new';
const dbPath = require.resolve('../src/lib/db');
const storagePath = require.resolve('../src/services/storage');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: { teamMember: {
  findUnique: async () => ({ ...member }),
  findFirst: async () => referenceTaken ? { id: 'another-member' } : null,
  update: async ({ data }) => {
    events.push('save');
    if (saveFails) throw new Error('Simulated database failure');
    savedData = data;
    member = { ...member, ...data };
    return member;
  },
} } } };
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: {
  uploadFile: async (file, options) => {
    events.push('upload');
    assert.deepEqual(options, { folder: 'team', kind: 'image' });
    assert.ok(file.buffer.length);
    if (uploadFails) throw new Error('Simulated Cloudinary failure');
    return { url: newUrl, publicId: newId, bytes: file.size };
  },
  destroyFile: async (id, kind) => { assert.equal(kind, 'image'); events.push('delete:' + id); },
} };
const resource = require('../src/admin/resources').find((entry) => entry.key === 'team');
const { crudRouter } = require('../src/admin/crud');

test('the admin form provides portrait preview, replacement, removal and multipart CSRF controls', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const Handlebars = require('handlebars').create();
  const helpers = require('../src/helpers/handlebars');
  for (const [name, helper] of Object.entries(helpers)) Handlebars.registerHelper(name, helper);
  for (const name of ['icon', 'admin/page-header', 'admin/field']) {
    Handlebars.registerPartial(name, fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'partials', name + '.hbs'), 'utf8'));
  }
  const render = Handlebars.compile(fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'admin', 'resource-form.hbs'), 'utf8'));
  const html = render({ title: 'Edit team member', item: { id: 'member' }, resource: { base: '/admin/team', label: 'Team members' },
    action: '/admin/team/member', csrfToken: 'test-token', hasUploads: true, values: { name: 'Dr. Martin Ogola', referenceCode: 'K-1' },
    fields: resource.fields.map((field) => ({ ...field, currentUrl: field.name === 'photo' ? oldUrl : null })) });
  assert.match(html, /enctype="multipart\/form-data"/);
  assert.match(html, /action="\/admin\/team\/member\?_csrf=test-token"/);
  assert.match(html, /name="photo"/);
  assert.match(html, /accept="\.jpg,\.jpeg,\.png,\.webp"/);
  assert.match(html, /name="remove_photo"/);
  assert.match(html, /alt="Current Portrait photo"/);
  assert.match(html, /value="K-1"/);
  assert.match(html, /400 × 400 pixels/);
});

function reset() {
  member = { id: 'member', name: 'Dr. Martin Ogola', title: 'Team Leader', referenceCode: 'K-1', photoUrl: oldUrl, photoPublicId: oldId };
  events = [];
  uploadFails = saveFails = referenceTaken = false;
  savedData = null;
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ZkAAAAASUVORK5CYII=', 'base64');

test('admin portrait editing preserves files correctly across success and failure', async (t) => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.flash = () => {};
    res.render = (view, data) => res.json({ view, errors: data.errors, values: data.values,
      currentPhoto: data.fields.find((field) => field.name === 'photo').currentUrl, hasUploads: data.hasUploads });
    next();
  });
  app.use('/admin/team', crudRouter(resource));
  app.use((err, req, res, next) => res.status(500).json({ error: 'Save failed' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/admin/team/member';

  async function submit({ file, type = 'image/png', filename = 'portrait.png', extra = {} } = {}) {
    const body = new FormData();
    for (const [key, value] of Object.entries({ name: 'Dr. Martin Ogola', title: 'Updated Team Leader', referenceCode: 'K-1',
      email: 'ogola.martin@ku.ac.ke', phone: '0722343926', displayOrder: '1', isPublished: 'on', ...extra })) body.set(key, value);
    if (file) body.set('photo', new Blob([file], { type }), filename);
    return fetch(url, { method: 'POST', body, redirect: 'manual' });
  }

  await t.test('text edits keep the existing portrait and normalise the reference', async () => {
    reset();
    const response = await submit({ extra: { referenceCode: 'k-1' } });
    assert.equal(response.status, 302);
    assert.deepEqual(events, ['save']);
    assert.equal(member.photoUrl, oldUrl);
    assert.equal(member.photoPublicId, oldId);
    assert.equal(savedData.referenceCode, 'K-1');
    assert.equal(Object.hasOwn(savedData, 'photoUrl'), false);
  });
  await t.test('a replacement saves before deleting the previous Cloudinary asset', async () => {
    reset();
    assert.equal((await submit({ file: png })).status, 302);
    assert.deepEqual(events, ['upload', 'save', 'delete:' + oldId]);
    assert.equal(member.photoUrl, newUrl);
    assert.equal(member.photoPublicId, newId);
  });
  await t.test('upload failures show an inline error and retain the portrait and entered values', async () => {
    reset(); uploadFails = true;
    const response = await submit({ file: png });
    assert.equal(response.status, 422);
    const form = await response.json();
    assert.match(form.errors.photo, /current file has been kept/);
    assert.equal(form.currentPhoto, oldUrl);
    assert.equal(form.values.title, 'Updated Team Leader');
    assert.equal(form.hasUploads, true);
    assert.deepEqual(events, ['upload']);
    assert.equal(member.photoPublicId, oldId);
  });
  await t.test('a failed database save deletes only the new upload', async () => {
    reset(); saveFails = true;
    assert.equal((await submit({ file: png })).status, 500);
    assert.deepEqual(events, ['upload', 'save', 'delete:' + newId]);
    assert.equal(member.photoPublicId, oldId);
    assert.equal(member.photoUrl, oldUrl);
  });
  await t.test('disguised image files and unsupported formats fail before storage', async () => {
    for (const options of [{ file: Buffer.from('invalid image') }, { file: Buffer.from('<svg/>'), type: 'image/svg+xml', filename: 'portrait.svg' }]) {
      reset();
      const response = await submit(options);
      assert.equal(response.status, 422);
      const form = await response.json();
      assert.ok(form.errors.photo);
      assert.equal(form.currentPhoto, oldUrl);
      assert.deepEqual(events, []);
    }
  });
  await t.test('removing a portrait saves the empty fields before Cloudinary cleanup', async () => {
    reset();
    assert.equal((await submit({ extra: { remove_photo: 'on' } })).status, 302);
    assert.equal(member.photoUrl, null);
    assert.equal(member.photoPublicId, null);
    assert.deepEqual(events, ['save', 'delete:' + oldId]);
  });
  await t.test('a legacy static portrait can be removed without deleting its source file', async () => {
    reset(); member.photoUrl = '/images/team/original.webp'; member.photoPublicId = null;
    assert.equal((await submit({ extra: { remove_photo: 'on' } })).status, 302);
    assert.equal(member.photoUrl, null);
    assert.deepEqual(events, ['save']);
  });
  await t.test('duplicate references are rejected before uploading a portrait', async () => {
    reset(); referenceTaken = true;
    const response = await submit({ file: png, extra: { referenceCode: 'K-2' } });
    assert.equal(response.status, 422);
    assert.match((await response.json()).errors.referenceCode, /already belongs/);
    assert.deepEqual(events, []);
  });
});

test('Cloudinary storage creates a new image and invalidates cached images on cleanup', async () => {
  const cloudPath = require.resolve('cloudinary');
  let uploadOptions, cleanupOptions;
  require.cache[cloudPath] = { id: cloudPath, filename: cloudPath, loaded: true, exports: { v2: {
    config() {},
    uploader: {
      upload_stream(options, callback) {
        uploadOptions = options;
        return { end: () => callback(null, { secure_url: newUrl, public_id: newId, bytes: png.length }) };
      },
      async destroy(id, options) { assert.equal(id, newId); cleanupOptions = options; },
    },
  } } };
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[key] = 'test-only';
  delete require.cache[storagePath];
  const storage = require('../src/services/storage');
  const uploaded = await storage.uploadFile({ buffer: png }, { kind: 'image', folder: 'team' });
  assert.equal(uploaded.publicId, newId);
  assert.deepEqual(uploadOptions, { folder: 'bshcdss/team', resource_type: 'image', overwrite: false });
  await storage.destroyFile(newId, 'image');
  assert.deepEqual(cleanupOptions, { resource_type: 'image', invalidate: true });
});
