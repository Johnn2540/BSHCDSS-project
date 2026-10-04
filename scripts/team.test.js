const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Handlebars = require('handlebars').create();
const { initialsFor, buildTeamPresentation } = require('../src/services/team');
const roster = require('../src/data/projectTeam');
const helpers = require('../src/helpers/handlebars');
const config = require('../src/config/pages').find((page) => page.slug === 'team');
const page = Object.fromEntries(config.fields.map((field) => [field.name, field.default]));

for (const [name, helper] of Object.entries(helpers)) Handlebars.registerHelper(name, helper);
for (const name of ['icon', 'page-hero', 'team-profile']) {
  Handlebars.registerPartial(name, fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'partials', name + '.hbs'), 'utf8'));
}
const render = Handlebars.compile(fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'public', 'team.hbs'), 'utf8'));
const support = { id: 'support', name: 'Cestine W. Ndongoli', title: 'Project Administrator', bio: 'Administrative support.' };

test('the supplied roster has ten distinct references and retains the lead profile identity', () => {
  assert.equal(roster.length, 10);
  assert.equal(new Set(roster.map((member) => member.id)).size, 10);
  assert.deepEqual(roster.map((member) => member.referenceCode), Array.from({ length: 10 }, (_, i) => 'K-' + (i + 1)));
  assert.equal(roster[0].name, 'Dr. Martin Ogola');
  assert.equal(roster[0].id, 'team-martin-ogopa');
  assert.equal(roster[0].email, 'ogola.martin@ku.ac.ke');
  assert.equal(roster[0].phone, '0722343926');
});

test('the team leader is featured, specialists keep CMS order, and support stays separate', () => {
  const team = buildTeamPresentation([support, ...roster]);
  assert.equal(team.leader.referenceCode, 'K-1');
  assert.deepEqual(team.specialists.map((member) => member.referenceCode), roster.slice(1).map((member) => member.referenceCode));
  assert.deepEqual(team.support.map((member) => member.id), ['support']);
  assert.equal(team.keyCount, 10);
  assert.equal(team.total, 11);
  assert.equal(buildTeamPresentation(roster.slice(1)).leader, null);
  assert.equal(buildTeamPresentation([]).total, 0);
  assert.equal(roster[0].initials, undefined, 'Presentation must not mutate the source records.');
});

test('portrait initials ignore honorifics and middle initials', () => {
  assert.equal(initialsFor('Dr. Martin Ogola'), 'MO');
  assert.equal(initialsFor('Dr.Samson I. Kariuki'), 'SK');
  assert.equal(initialsFor('Prof. Dr. Hellen G. Kiende'), 'HK');
  assert.equal(initialsFor('Cestine W. Ndongoli'), 'CN');
  assert.equal(initialsFor('Peter'), 'P');
  assert.equal(initialsFor(null), '');
});

test('public profiles render the full roster, contacts and honest portrait placeholders', () => {
  const html = render({ page, team: buildTeamPresentation([...roster, support]) });
  assert.equal((html.match(/data-team-profile/g) || []).length, 11);
  for (const member of roster) {
    assert.ok(html.includes(member.name));
    assert.ok(html.includes(member.title));
    assert.ok(html.includes('>' + member.referenceCode + '</span>'));
  }
  assert.match(html, /href="mailto:ogola\.martin@ku\.ac\.ke"/);
  assert.match(html, /href="tel:0722343926"/);
  assert.match(html, /team-initials" aria-hidden="true">MO/);
  assert.match(html, /Project administration and support/);
  assert.doesNotMatch(html, /<img|More team members will appear|Read biography/);
});

test('Cloudinary portraits use face cropping, responsive sizes and accessible image text', () => {
  const member = { ...roster[0], photoUrl: 'https://res.cloudinary.com/test/image/upload/v1/bshcdss/team/portrait.png' };
  const html = render({ page, team: buildTeamPresentation([member]) });
  assert.match(html, /f_auto,q_auto,w_320,h_320,c_fill,g_face/);
  assert.match(html, /160w, .*320w, .*480w/);
  assert.match(html, /alt="Dr\. Martin Ogola"/);
  assert.match(html, /loading="lazy" decoding="async"/);
  assert.doesNotMatch(html, /team-initials/);
});

test('profile content is escaped and long biographies work with native disclosure controls', () => {
  const member = { ...roster[1], name: '<script>alert(1)</script>', bio: '<script>' + 'A biography paragraph. '.repeat(20) };
  const html = render({ page, team: buildTeamPresentation([member]) });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<details class="group">/);
  assert.match(html, /<summary/);
  assert.match(render({ page, team: buildTeamPresentation([]) }), /Team profiles will be published here soon/);
});
