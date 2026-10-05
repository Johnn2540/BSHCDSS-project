const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createPortalFixture, state, content, password } = require('./fixtures/tutorPortal');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server, chrome, ws, id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const command = ++id;
    const timeout = setTimeout(() => { pending.delete(command); reject(new Error('Timed out: ' + method)); }, 30000);
    pending.set(command, { resolve, reject, timeout }); ws.send(JSON.stringify({ id: command, method, params }));
  });
}
async function evaluate(expression) {
  const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (value.exceptionDetails) throw new Error('Browser evaluation failed: ' + (value.exceptionDetails.exception?.description || value.exceptionDetails.text));
  return value.result.value;
}
async function until(check, label) {
  const start = Date.now();
  while (Date.now() - start < 30000) { if (await check()) return; await delay(150); }
  throw new Error('Timed out: ' + label);
}
async function main() {
  server = createPortalFixture().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const port = 9500 + process.pid % 200;
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-extensions', '--no-proxy-server', '--remote-debugging-port=' + port,
    '--user-data-dir=' + path.join(os.tmpdir(), 'bshcdss-tutor-check-' + process.pid), 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let target;
  await until(async () => { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find((page) => page.type === 'page'); return Boolean(target); } catch { return false; } }, 'browser start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', (event) => {
    const result = JSON.parse(event.data), command = pending.get(result.id);
    if (!command) return; clearTimeout(command.timeout); pending.delete(result.id);
    if (result.error) command.reject(new Error(result.error.message)); else command.resolve(result.result);
  });
  await send('Page.enable'); await send('Runtime.enable');
  async function navigate(route) {
    const url = base + route;
    await send('Page.navigate', { url });
    await until(() => evaluate('location.href === ' + JSON.stringify(url) + ' && document.readyState === "complete"'), 'page load ' + route);
  }
  await navigate('/login');
  await until(() => evaluate('!!document.querySelector("#email") && !!document.querySelector("#password")'), 'login fields');
  await evaluate('document.querySelector("#email").value="tutor@example.test"; document.querySelector("#password").value=' + JSON.stringify(password) + '; document.querySelector("main form").requestSubmit();');
  await until(() => evaluate('location.pathname === "/tutor" && document.readyState === "complete" && !!document.querySelector("[data-tutor-sections]")'), 'tutor login');
  await fs.mkdir(path.join(__dirname, '../.artifacts'), { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1050, deviceScaleFactor: 1, mobile: width < 640 });
    for (const route of ['/tutor', '/tutor/documents', '/tutor/reports', '/tutor/plans-and-activities', '/tutor/password']) {
      await navigate(route + '?browser-check=' + width);
      const checks = await evaluate(`(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        headingCount: document.querySelectorAll('main h1').length,
        activeLinks: Array.from(document.querySelectorAll('[data-tutor-nav] [aria-current="page"]')).map(a => a.getAttribute('href')),
        controls: Array.from(document.querySelectorAll('main input:not([type=hidden]), main select, main button, main .document-download, .tutor-nav-link')).filter(e => e.getBoundingClientRect().height > 0).map(e => ({height:e.getBoundingClientRect().height, label: e.textContent || e.name})),
        adminLinks: Array.from(document.querySelectorAll('main a[href^="/admin"]')).length,
        cards: document.querySelectorAll('.tutor-resource-card').length,
      }))()`);
      assert.equal(checks.overflow, false, route + ' overflows at ' + width);
      assert.equal(checks.headingCount, 1, route);
      assert.equal(checks.adminLinks, 0, 'Tutor should not get admin publishing links.');
      if (route !== '/tutor/password') assert.deepEqual(checks.activeLinks, [route]);
      if (route === '/tutor') assert.equal(checks.cards, 3);
      assert.ok(checks.controls.every(control => control.height >= 40), 'Small form/navigation target at ' + route);
      if (route === '/tutor' || (route === '/tutor/reports' && [390, 1440].includes(width))) {
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        await fs.writeFile(path.join(__dirname, '../.artifacts/tutor-' + (route === '/tutor' ? 'overview' : 'reports') + '-' + width + '.png'), Buffer.from(shot.data, 'base64'));
      }
    }
    console.log('Verified Tutor Portal navigation, resources, password form and layout at ' + width + 'px.');
  }
  await navigate('/tutor/reports?q=training');
  assert.equal(await evaluate('document.querySelectorAll(".document-download").length'), 1);
  state.documents = state.documents.filter(row => row.portalSection !== 'REPORTS'); content.clearCache();
  await navigate('/tutor/reports?empty-check=1');
  assert.ok(await evaluate('document.querySelector("main").textContent.includes("No reports have been published here yet")'));
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate('/tutor/documents?no-script-check=1');
  assert.equal(await evaluate('document.querySelectorAll(".document-download").length'), 2);
  console.log('Verified search, empty states and navigation/download links without JavaScript.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (ws) ws.close(); if (chrome) chrome.kill(); for (const command of pending.values()) clearTimeout(command.timeout);
  if (server) await new Promise((resolve) => server.close(resolve));
});
