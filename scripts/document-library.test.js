const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Handlebars = require('handlebars');
const { buildDocumentLibrary } = require('../src/services/documentLibrary');
const catalogue = require('../src/data/curriculumDocuments');
const helpers = require('../src/helpers/handlebars');
const pageConfig = require('../src/config/pages').find((page) => page.slug === 'curriculum');
const page = Object.fromEntries(pageConfig.fields.map((field) => [field.name, field.default]));

const groups = [
  { category: 'Languages and literacy', documents: [
    { id: 'english', title: 'English Language Education', description: 'Language acquisition in children.', category: 'Languages and literacy', fileName: 'english.doc', fileSize: 1538560 },
  ] },
  { category: 'Science and mathematics', documents: [
    { id: 'math', title: 'Mathematics Education', description: 'Numbers and patterns.', category: 'Science and mathematics', fileName: 'mathematics.doc', fileSize: 1619968 },
    { id: 'science', title: 'Integrated Science Education', description: 'Living things.', category: 'Science and mathematics', fileName: 'science.docx', fileSize: 1000 },
  ] },
];

test('search combines keywords across the title and description', () => {
  const library = buildDocumentLibrary(groups, { q: '  MATHEMATICS  patterns  ' });
  assert.equal(library.q, 'MATHEMATICS patterns');
  assert.equal(library.total, 3);
  assert.equal(library.resultCount, 1);
  assert.equal(library.groups[0].documents[0].id, 'math');
});

test('subject search matches document content without returning its entire category', () => {
  const library = buildDocumentLibrary(groups, { q: 'mathematics' });
  assert.equal(library.resultCount, 1);
  assert.equal(library.groups[0].documents[0].id, 'math');
});

test('search and category filters combine; clearing restores the full library', () => {
  assert.equal(buildDocumentLibrary(groups, { q: 'education', category: 'Languages and literacy' }).resultCount, 1);
  assert.equal(buildDocumentLibrary(groups, { q: 'nonexistent' }).resultCount, 0);
  assert.equal(buildDocumentLibrary(groups).resultCount, 3);
  assert.equal(buildDocumentLibrary([], {}).total, 0);
});

test('malformed and oversized query parameters are bounded', () => {
  assert.equal(buildDocumentLibrary(groups, { q: ['math'], category: { x: 1 } }).resultCount, 3);
  assert.equal(buildDocumentLibrary(groups, { q: 'x'.repeat(500) }).q.length, 150);
  assert.equal(buildDocumentLibrary(groups, { category: 'unknown' }).category, '');
});

test('all fourteen source files have distinct identities and valid Word signatures', () => {
  assert.equal(catalogue.length, 14);
  assert.equal(new Set(catalogue.map((entry) => entry.id)).size, 14);
  assert.equal(new Set(catalogue.map((entry) => entry.fileName)).size, 14);
  for (const entry of catalogue) {
    const file = fs.readFileSync(path.join(__dirname, '..', 'documents', 'Collection of Curriculum Designs in Different Subject Areas', entry.fileName));
    assert.equal(file.subarray(0, entry.fileName.endsWith('.docx') ? 4 : 8).toString('hex'),
      entry.fileName.endsWith('.docx') ? '504b0304' : 'd0cf11e0a1b11ae1');
  }
  assert.deepEqual(catalogue.find((entry) => entry.id === 'curriculum-master-trainers-manual').activitySlugs, ['in-service-training', 'cpd']);
});

for (const [name, helper] of Object.entries(helpers)) Handlebars.registerHelper(name, helper);
for (const name of ['icon', 'document-list', 'document-library', 'prose']) {
  Handlebars.registerPartial(name, fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'partials', name + '.hbs'), 'utf8'));
}
const render = Handlebars.compile(fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'public', 'curriculum.hbs'), 'utf8'));

test('the page renders downloads, metadata and category navigation with no scripting required', () => {
  const html = render({ page, library: buildDocumentLibrary(groups) });
  assert.match(html, /href="\/documents\/english\/download"/);
  assert.match(html, /Word document/);
  assert.match(html, /1.5 MB/);
  assert.match(html, /<h4[^>]*>English Language Education<\/h4>/);
  assert.match(html, /action="\/curriculum#document-library"/);
  assert.match(html, /href="#document-group-2"/);
  assert.doesNotMatch(html, /filePublicId|res\.cloudinary\.com/);
});

test('empty results offer a usable reset, and supplied query text is escaped', () => {
  const html = render({ page, library: buildDocumentLibrary(groups, { q: '<script>alert(1)</script>' }) });
  assert.match(html, /No matching documents/);
  assert.match(html, /View all documents/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});
