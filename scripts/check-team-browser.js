require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const app = require('../src/app');
const { prisma, pool } = require('../src/lib/db');
const roster = require('../src/data/projectTeam');

const artifactDir = path.join(__dirname, '..', '.artifacts');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server, chrome, ws, commandId = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error('Browser evaluation failed.');
  return result.result.value;
}
async function until(check, label) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    if (await check()) return;
    await delay(200);
  }
  throw new Error('Timed out: ' + label);
}
async function main() {
  const members = await prisma.teamMember.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] });
  const keyMembers = members.filter((member) => member.referenceCode);
  assert.equal(keyMembers.length, 10);
  for (const entry of roster) {
    const member = members.find((member) => member.referenceCode === entry.referenceCode);
    assert.equal(member.name, entry.name);
    assert.equal(member.title, entry.title);
    assert.equal(member.isPublished, true);
  }
  const lead = members.find((member) => member.referenceCode === 'K-1');
  assert.equal(lead.id, roster[0].id);
  assert.equal(lead.email, roster[0].email);
  assert.equal(lead.phone, roster[0].phone);
  const support = members.find((member) => member.name === 'Cestine W. Ndongoli');
  assert.ok(support.bio && support.institution);
  assert.ok(support.photoPublicId.startsWith('bshcdss/team/'));
  assert.match(support.photoUrl, /^https:\/\/res\.cloudinary\.com\//);
  await fs.access(path.join(__dirname, '..', 'public', 'images', 'team', 'cestine-ndongoli.webp'));
  console.log('Verified database roster, retained lead contacts and Cloudinary portrait.');

  await fs.mkdir(artifactDir, { recursive: true });
  let base = process.env.TEAM_CHECK_URL;
  if (!base) {
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
  }
  const restricted = await fetch(base + '/admin/team', { redirect: 'manual' });
  assert.equal(restricted.status, 302);
  assert.equal(restricted.headers.get('location'), '/login');

  const debugPort = 9600 + process.pid % 400;
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions', '--no-proxy-server',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + path.join(os.tmpdir(), 'bshcdss-team-check-' + process.pid), 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let pages;
  await until(async () => {
    try { pages = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json(); return pages.some((page) => page.type === 'page'); }
    catch { return false; }
  }, 'browser start');
  ws = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', (event) => {
    const result = JSON.parse(event.data);
    const command = pending.get(result.id);
    if (!command) return;
    clearTimeout(command.timeout); pending.delete(result.id);
    if (result.error) command.reject(new Error(result.error.message));
    else command.resolve(result.result);
  });
  await send('Page.enable');
  await send('Runtime.enable');

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1100, mobile: false },
    { name: 'tablet', width: 768, height: 1024, mobile: false },
    { name: 'mobile', width: 390, height: 844, mobile: true },
    { name: 'small-mobile', width: 320, height: 760, mobile: true },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await send('Page.navigate', { url: base + '/team' });
    await until(async () => await evaluate('document.readyState === "complete" && location.pathname === "/team"'), 'team page');
    const state = await evaluate(`({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      profiles: document.querySelectorAll('[data-team-profile]').length,
      references: Array.from(document.querySelectorAll('.team-reference')).map(el => el.textContent.trim()),
      lead: document.querySelector('.team-profile-featured h3')?.textContent,
      initials: document.querySelectorAll('.team-initials').length,
      support: document.querySelector('.team-profile-support h3')?.textContent,
      administratorContacts: Array.from(document.querySelectorAll('.team-profile-support .team-contact-link')).map(el => ({href: el.getAttribute('href'), iconInsideLink: Boolean(el.querySelector('svg'))})),
      // Layout size, not the painted rectangle: a card is briefly scaled while it animates in, but the tap target is not.
      contactTargets: Array.from(document.querySelectorAll('.team-contact-link')).map(el => ({height: el.offsetHeight, width: el.offsetWidth})),
      portraits: Array.from(document.querySelectorAll('.team-portrait')).map(el => ({height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width})),
      names: Array.from(document.querySelectorAll('.team-member-name')).map(el => ({client: el.clientWidth, scroll: el.scrollWidth})),
      photos: Array.from(document.querySelectorAll('img.team-portrait')).map(el => ({src: el.currentSrc || el.src}))
    })`);
    assert.equal(state.profiles, 11);
    assert.deepEqual(state.references, roster.map((member) => member.referenceCode));
    assert.equal(state.lead, 'Dr. Martin Ogola');
    assert.equal(state.support, 'Cestine W. Ndongoli');
    assert.ok(state.administratorContacts.some(contact => contact.href === 'https://wa.me/254715330094' && contact.iconInsideLink));
    assert.ok(state.administratorContacts.some(contact => contact.href === 'mailto:ndongoli.cestine@ku.ac.ke' && contact.iconInsideLink));
    assert.equal(state.initials, 10);
    assert.ok(state.scrollWidth <= state.width + 1, 'Horizontal overflow at ' + viewport.name);
    assert.ok(state.names.every((name) => name.scroll <= name.client + 1), 'A name overflows its card.');
    assert.ok(state.portraits.every((portrait) => Math.abs(portrait.width - portrait.height) < 1), 'Portrait aspect ratio changed.');
    assert.ok(state.contactTargets.every((target) => target.height >= 44 && target.width >= 44), 'Contact targets must be at least 44px.');
    assert.ok(state.photos.every((photo) => photo.src.includes('f_auto,q_auto') && photo.src.includes('c_fill,g_face')), 'Cloudinary transformation missing.');
    if (viewport.name === 'desktop' || viewport.name === 'mobile') {
      await evaluate('document.getElementById("key-team-heading").scrollIntoView();');
      await delay(250);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(artifactDir, 'team-' + viewport.name + '.png'), Buffer.from(shot.data, 'base64'));
    }
    await evaluate('document.querySelector(".team-profile-support").scrollIntoView();');
    await until(async () => await evaluate('Array.from(document.querySelectorAll("img.team-portrait")).every(img => img.complete && img.naturalWidth > 0)'), 'Cloudinary portrait delivery');
    if (viewport.name === 'desktop' || viewport.name === 'mobile') {
      await delay(400);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(artifactDir, 'team-administrator-' + viewport.name + '.png'), Buffer.from(shot.data, 'base64'));
    }
    console.log('Verified team layout, contacts and portrait delivery at ' + viewport.width + 'px.');
  }
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url: base + '/team' });
  await until(async () => await evaluate('document.readyState === "complete" && document.querySelectorAll("[data-team-profile]").length === 11'), 'no-JavaScript profiles');
  console.log('Verified profiles without JavaScript and protected admin access.');
  console.log('Team browser verification passed. Screenshots: .artifacts/team-desktop.png and team-mobile.png.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (ws) ws.close();
  for (const command of pending.values()) clearTimeout(command.timeout);
  if (chrome) chrome.kill();
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  await pool.end();
});
