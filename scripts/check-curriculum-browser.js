require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const app = require('../src/app');
const { prisma, pool } = require('../src/lib/db');
const catalogue = require('../src/data/curriculumDocuments');

const artifactDir = path.join(__dirname, '..', '.artifacts');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server, chrome, ws;
const pending = new Map();
let commandId = 0;
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
async function until(check, label, duration = 30000) {
  const start = Date.now();
  while (Date.now() - start < duration) {
    if (await check()) return;
    await delay(200);
  }
  throw new Error('Timed out: ' + label);
}
async function navigate(url) {
  await send('Page.navigate', { url });
  await until(async () => await evaluate('document.readyState === "complete" && location.href === ' + JSON.stringify(url)), 'page load');
}
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  for (const entry of process.argv.includes('--skip-downloads') ? [] : catalogue) {
    const response = await fetch(base + '/documents/' + entry.id + '/download');
    assert.equal(response.status, 200, 'Download failed: ' + entry.title);
    const downloaded = Buffer.from(await response.arrayBuffer());
    const original = await fs.readFile(path.join(__dirname, '..', 'documents', 'Collection of Curriculum Designs in Different Subject Areas', entry.fileName));
    assert.equal(hash(downloaded), hash(original), 'File differs from the original: ' + entry.title);
    console.log('Verified download: ' + entry.title);
  }
  const oldSource = '/documents/Collection%20of%20Curriculum%20Designs%20in%20Different%20Subject%20Areas/' + encodeURIComponent(catalogue[0].fileName);
  assert.equal((await fetch(base + oldSource)).status, 404);
  for (const slug of ['in-service-training', 'cpd']) {
    const response = await fetch(base + '/activities/' + slug);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('/documents/curriculum-master-trainers-manual/download'), 'Trainer manual missing on ' + slug);
  }
  const tutorResponse = await fetch(base + '/tutor', { redirect: 'manual' });
  assert.equal(tutorResponse.status, 302);
  assert.equal(tutorResponse.headers.get('location'), '/login');
  console.log('Verified training-page placement and tutor login protection.');

  const debugPort = 9400 + process.pid % 500;
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions', '--no-proxy-server',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + path.join(os.tmpdir(), 'bshcdss-curriculum-check-' + process.pid),
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let pages;
  await until(async () => {
    try { pages = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json(); return pages.some((page) => page.type === 'page'); }
    catch { return false; }
  }, 'browser start');
  const target = pages.find((page) => page.type === 'page');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', (event) => {
    const result = JSON.parse(event.data);
    const command = pending.get(result.id);
    if (!command) return;
    clearTimeout(command.timeout);
    pending.delete(result.id);
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
    await navigate(base + '/curriculum');
    const state = await evaluate(`({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      documents: document.querySelectorAll('.document-row').length,
      title: document.querySelector('h1').textContent,
      controls: Array.from(document.querySelectorAll('.document-download')).map((a) => ({ width: a.getBoundingClientRect().width, height: a.getBoundingClientRect().height }))
    })`);
    assert.equal(state.documents, 14);
    assert.ok(state.scrollWidth <= state.width + 1, 'Horizontal overflow at ' + viewport.name);
    assert.ok(state.controls.every((control) => control.height >= 44 && control.width >= 44), 'Download target too small.');
    if (viewport.name === 'desktop' || viewport.name === 'mobile') {
      await delay(250);
      let screenshot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(artifactDir, 'curriculum-' + viewport.name + '.png'), Buffer.from(screenshot.data, 'base64'));
      await evaluate('document.getElementById("document-library").scrollIntoView();');
      await delay(200);
      screenshot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(artifactDir, 'curriculum-library-' + viewport.name + '.png'), Buffer.from(screenshot.data, 'base64'));
    }
    console.log('Verified layout at ' + viewport.width + 'px (' + viewport.name + ').');
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(base + '/curriculum');
  await evaluate('document.getElementById("document-search").value = "mathematics"; document.querySelector(".library-search").requestSubmit();');
  await until(async () => await evaluate('document.readyState === "complete" && location.search.includes("q=mathematics")'), 'search submit');
  assert.equal(await evaluate('document.querySelectorAll(".document-row").length'), 1);
  assert.ok(await evaluate('document.querySelector(".document-row").textContent.includes("Mathematics Education")'));
  const category = 'Languages and literacy';
  await navigate(base + '/curriculum?category=' + encodeURIComponent(category));
  assert.equal(await evaluate('document.querySelectorAll(".document-row").length'), 2);
  await navigate(base + '/curriculum?q=nonexistent');
  assert.equal(await evaluate('document.querySelectorAll(".document-row").length'), 0);
  assert.ok(await evaluate('document.body.textContent.includes("No matching documents")'));
  await evaluate('document.querySelector(".library-empty a").click()');
  await until(async () => await evaluate('document.readyState === "complete" && document.querySelectorAll(".document-row").length === 14'), 'clear filters');
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate(base + '/curriculum?q=mathematics');
  assert.equal(await evaluate('document.querySelectorAll(".document-row").length'), 1);
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  console.log('Verified search, subject filtering, empty results, reset and no-JavaScript support.');
  console.log('Browser and download verification complete. Screenshots are in .artifacts/.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (ws) ws.close();
  for (const command of pending.values()) clearTimeout(command.timeout);
  if (chrome) chrome.kill();
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  await pool.end();
});

