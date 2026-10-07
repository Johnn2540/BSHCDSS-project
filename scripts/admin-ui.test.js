// Markup contracts for the admin row-actions menu and shared admin helpers. Renders the real templates only;
// no database, session or browser is involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { create } = require('express-handlebars');
const helpers = require('../src/helpers/handlebars');

const hbs = create({ extname: '.hbs', partialsDir: path.join(__dirname, '..', 'src', 'views', 'partials'), helpers });

async function render(view, context) {
  const partials = await hbs.getPartials();
  const source = await hbs.getTemplate(path.join(__dirname, '..', 'src', 'views', view + '.hbs'), { precompiled: false });
  return source(context, { helpers, partials });
}

const tutor = (id, overrides = {}) => ({ id, name: 'Tutor ' + id, email: id + '@example.test', institution: '', status: 'ACTIVE', canManageContent: false, lastLoginAt: null, ...overrides });
const tabs = [{ label: 'All', href: '/admin/tutors', count: 4, active: true }];
const rowFor = (html, id) => {
  const rows = html.split('<tr>').slice(2);
  const row = rows.find((candidate) => candidate.includes('/admin/tutors/' + id + '/edit'));
  assert.ok(row, 'row for ' + id);
  return row;
};
const labels = (row) => [...row.matchAll(/role="menuitem"[^>]*>\s*(?:<svg[\s\S]*?<\/svg>)?\s*([^<]+?)\s*</g)].map((match) => match[1]);

test('nameInitials: two letters from the first and last words, one letter for one word, a placeholder for nothing', () => {
  assert.equal(helpers.nameInitials('Project Administrator'), 'PA');
  assert.equal(helpers.nameInitials('  grace  achol  '), 'GA');
  assert.equal(helpers.nameInitials('Mary Ann Smith'), 'MS');
  assert.equal(helpers.nameInitials('Plato'), 'P');
  assert.equal(helpers.nameInitials('Dr. Grace Achol'), 'GA', 'honorifics are ignored, as on the Team page');
  assert.equal(helpers.nameInitials(''), '?');
  assert.equal(helpers.nameInitials(undefined), '?');
  assert.equal(helpers.nameInitials(42), '?');
});

test('every tutor row has exactly one actions menu and no inline action links', async () => {
  const html = await render('admin/tutors/list', { tutors: [tutor('a'), tutor('b', { status: 'PENDING' })], tabs, csrfToken: 'token' });
  assert.equal((html.match(/data-row-menu/g) || []).length, 2);
  assert.equal((html.match(/class="action-link/g) || []).length, 0);
  assert.equal((html.match(/<details class="row-menu"/g) || []).length, 2);
});

test('menu items depend on the account state, exactly as the old inline links did', async () => {
  const html = await render('admin/tutors/list', {
    tutors: [
      tutor('fresh'),
      tutor('seen', { lastLoginAt: new Date('2026-10-01') }),
      tutor('pending', { status: 'PENDING' }),
      tutor('suspended', { status: 'SUSPENDED' }),
      tutor('delegated', { canManageContent: true, lastLoginAt: new Date('2026-10-01') }),
    ],
    tabs, csrfToken: 'token',
  });
  assert.deepEqual(labels(rowFor(html, 'fresh')), ['Edit details', 'Resend invitation', 'Promote to content admin', 'Suspend account', 'Delete account']);
  assert.deepEqual(labels(rowFor(html, 'seen')), ['Edit details', 'Promote to content admin', 'Suspend account', 'Delete account']);
  assert.deepEqual(labels(rowFor(html, 'pending')), ['Edit details', 'Approve account', 'Delete account']);
  assert.deepEqual(labels(rowFor(html, 'suspended')), ['Edit details', 'Reactivate account', 'Delete account']);
  assert.deepEqual(labels(rowFor(html, 'delegated')), ['Edit details', 'Revoke admin access', 'Suspend account', 'Delete account']);
});

test('state-changing items are POST forms with a CSRF token; navigation items are plain links', async () => {
  const html = await render('admin/tutors/list', { tutors: [tutor('fresh')], tabs, csrfToken: 'token-123' });
  const row = rowFor(html, 'fresh');
  for (const action of ['invite', 'promote', 'suspend']) {
    assert.match(row, new RegExp('<form method="post" action="/admin/tutors/fresh/' + action + '" class="row-menu-form" role="none">\\s*<input type="hidden" name="_csrf" value="token-123">'));
  }
  assert.match(row, /<a role="menuitem" class="row-menu-item" href="\/admin\/tutors\/fresh\/edit">/);
  assert.match(row, /<a role="menuitem" class="row-menu-item row-menu-item-danger" href="\/admin\/tutors\/fresh\/delete">/);
  assert.doesNotMatch(row, /\/approve|\/reactivate|\/demote/, 'actions that do not apply to this state are absent');
});

test('the menu is named after its row, keeps a visible label, and is a native disclosure', async () => {
  const html = await render('admin/tutors/list', { tutors: [tutor('fresh', { name: 'Grace Achol' })], tabs, csrfToken: 't' });
  assert.match(html, /<summary class="row-menu-trigger" aria-haspopup="menu" aria-label="Actions for Grace Achol">/);
  assert.match(html, /<div class="row-menu-panel" role="menu" aria-label="Actions for Grace Achol">/);
  assert.match(html, /<span>Actions<\/span>/, 'the accessible name contains the visible word');
  assert.match(html, /<div class="row-menu-sep" role="separator"><\/div>/);
});

test('phone cards: every data cell carries its column label and the title and actions cells are marked', async () => {
  const html = await render('admin/tutors/list', { tutors: [tutor('fresh')], tabs, csrfToken: 't' });
  const row = rowFor(html, 'fresh');
  for (const label of ['Institution', 'Status', 'Access', 'Last login']) assert.match(row, new RegExp('data-label="' + label + '"'));
  assert.match(row, /class="admin-cell-title"/);
  assert.match(row, /class="admin-cell-actions text-right"/);
  assert.match(html, /<table class="admin-table admin-table-stack">/);
  assert.match(row, /class="admin-initials" aria-hidden="true">TF</, 'avatar initials are decorative');
});

test('resource lists use the same menu, with Edit and Delete pointing at the resource', async () => {
  const html = await render('admin/resource-list', {
    resource: { label: 'Documents', singular: 'document', base: '/admin/documents', intro: '' },
    columns: [{ label: 'Title', type: 'text' }, { label: 'Status', type: 'published' }],
    rows: [{ id: 'd1', title: 'Guide', cells: [{ label: 'Title', type: 'text', value: 'Guide', isTitle: true }, { label: 'Status', type: 'published', value: true, isTitle: false }] }],
    total: 1, csrfToken: 't',
  });
  assert.equal((html.match(/data-row-menu/g) || []).length, 1);
  assert.match(html, /href="\/admin\/documents\/d1\/edit">/);
  assert.match(html, /href="\/admin\/documents\/d1\/delete">/);
  assert.match(html, /<td data-label="Status">/);
  assert.match(html, /aria-label="Actions for Guide"/);
  assert.equal((html.match(/class="action-link/g) || []).length, 0);
});
