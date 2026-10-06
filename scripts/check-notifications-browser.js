// Read-only UI checks against an isolated fixture; never publishes real announcements.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createFixture, state, reset, announcement, content } = require('./fixtures/publicNotifications');
let server, chrome, ws, nextId = 0;
const pending = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 20000);
    pending.set(id, {resolve, reject, timeout}); ws.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(fn, ...args) {
  const result = await send('Runtime.evaluate', {expression: '(' + fn.toString() + ')(' + args.map((value) => JSON.stringify(value)).join(',') + ')', returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(check, label) {
  const start = Date.now();
  while (Date.now() - start < 20000) { if (await check()) return; await delay(75); }
  throw new Error('Timed out: ' + label);
}
async function navigate(url) {
  await send('Page.navigate', {url});
  await until(() => evaluate((expected) => location.href === expected && document.readyState === 'complete', url), 'page load');
  await until(() => evaluate(() => document.querySelector('[data-notification-trigger]')?.getAttribute('aria-haspopup') === 'dialog'), 'notification enhancement');
}
async function key(keyName, code, virtualCode, modifiers = 0) {
  await send('Input.dispatchKeyEvent', {type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: virtualCode, modifiers, ...(keyName === 'Enter' ? {text: '\r', unmodifiedText: '\r'} : {})});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: virtualCode, modifiers});
}
async function open() {
  await evaluate(() => Array.from(document.querySelectorAll('[data-notification-trigger]')).find((button) => button.getClientRects().length).focus());
  await key('Enter', 'Enter', 13);
  await until(() => evaluate(() => document.querySelector('[data-notification-panel]').open), 'open panel');
  await until(() => evaluate(() => !document.querySelector('[data-notification-status]').textContent.includes('Checking')), 'panel refresh');
}
function metrics() {
  const dialog = document.querySelector('[data-notification-panel]');
  const box = dialog.getBoundingClientRect();
  const triggers = Array.from(document.querySelectorAll('[data-notification-trigger]'));
  return {overflow: document.documentElement.scrollWidth > innerWidth + 1,
    visibleTriggers: triggers.filter((button) => button.getClientRects().length).length,
    counts: triggers.map((button) => button.querySelector('[data-notification-count]').textContent),
    inside: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
    focusInside: dialog.contains(document.activeElement), errors: window.__notificationErrors || []};
}
async function main() {
  server = createFixture().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const port = 10000 + process.pid % 400;
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--no-proxy-server',
    '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(os.tmpdir(), 'bshcdss-notifications-check-' + process.pid), 'about:blank',
  ], {windowsHide: true, stdio: 'ignore'});
  let target;
  await until(async () => {try {target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find((page) => page.type === 'page'); return Boolean(target);} catch {return false;}}, 'browser start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true});});
  ws.addEventListener('message', (event) => {
    const result = JSON.parse(event.data), command = pending.get(result.id);
    if (!command) return;
    clearTimeout(command.timeout); pending.delete(result.id);
    if (result.error) command.reject(new Error(result.error.message)); else command.resolve(result.result);
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', {enabled: true});
  await send('Page.addScriptToEvaluateOnNewDocument', {source: 'window.__notificationErrors=[];window.addEventListener("error",function(e){if(e.message)window.__notificationErrors.push(e.message)});window.addEventListener("unhandledrejection",function(e){window.__notificationErrors.push(String(e.reason))});'});
  await fs.mkdir(path.join(__dirname, '../.artifacts'), {recursive: true});
  for (const width of [320, 390, 768, 1280, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 640});
    await navigate(base + '/');
    await until(() => evaluate(() => document.querySelector('[data-notification-count]').textContent === '2'), 'new count');
    await open();
    const result = await evaluate(metrics);
    assert.equal(result.overflow, false, width + ': no page overflow');
    assert.equal(result.visibleTriggers, 1, width + ': one visible bell');
    assert.equal(result.inside, true, width + ': panel fits the screen');
    assert.equal(result.focusInside, true, width + ': initial dialog focus');
    assert.deepEqual(result.errors, [], width + ': browser errors');
    await evaluate(() => document.querySelector('[data-notification-refresh]').focus());
    await key('Tab', 'Tab', 9);
    assert(await evaluate(() => document.querySelector('[data-notification-panel]').contains(document.activeElement)), 'Tab remains in the modal');
    await evaluate(() => document.querySelector('[data-notification-item] summary').focus());
    await key('Enter', 'Enter', 13);
    await until(() => evaluate(() => document.querySelector('[data-notification-item]').open), 'keyboard opens the full notice');
    if (width === 390 || width === 1440) {
      await delay(220);
      const screenshot = await send('Page.captureScreenshot', {format: 'png'});
      await fs.writeFile(path.join(__dirname, '../.artifacts/notifications-' + width + '.png'), Buffer.from(screenshot.data, 'base64'));
    }
    await key('Escape', 'Escape', 27);
    assert(await evaluate(() => document.activeElement.hasAttribute('data-notification-trigger') && !document.documentElement.classList.contains('notifications-open')), 'Escape restores the bell and scroll');
    console.log('PASS notifications at ' + width + 'px: bell, panel, keyboard, reading and focus');
  }
  await open();
  await evaluate(() => document.querySelector('[data-notification-read-all]').click());
  assert.deepEqual((await evaluate(metrics)).counts, ['0', '0']);
  await key('Escape', 'Escape', 27);
  await navigate(base + '/about');
  await until(() => evaluate(() => document.querySelector('[data-notification-count]').textContent === '0'), 'read state across pages');
  state.announcements.push(announcement('new-public', {title: 'New public project notice', updatedAt: new Date()})); content.clearCache();
  await open();
  await until(() => evaluate(() => document.querySelector('[data-notification-count]').textContent === '1'), 'new notice after reading');
  assert(await evaluate(() => document.querySelector('[data-notification-list]').textContent.includes('New public project notice')));
  await key('Escape', 'Escape', 27);
  console.log('PASS read persistence and a newly published notification');

  // The two existing menus can still be used independently of notifications.
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 900, deviceScaleFactor: 1, mobile: true});
  await evaluate(() => document.querySelector('[data-drawer-open]').click());
  assert(await evaluate(() => document.getElementById('site-drawer').classList.contains('is-open')));
  await key('Escape', 'Escape', 27);
  await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
  await evaluate(() => document.querySelector('[data-dropdown-toggle]').focus());
  await key('ArrowDown', 'ArrowDown', 40);
  assert(await evaluate(() => document.activeElement.closest('[data-dropdown-menu]') !== null));
  await key('Escape', 'Escape', 27);
  console.log('PASS existing mobile menu and desktop dropdown');

  await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
  await open();
  assert.equal(await evaluate(() => document.querySelector('[data-notification-panel]').getAnimations().length), 0);
  // A real pointer click on the backdrop dismisses the panel.
  await send('Input.dispatchMouseEvent', {type: 'mousePressed', x: 10, y: 450, button: 'left', clickCount: 1});
  await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: 10, y: 450, button: 'left', clickCount: 1});
  assert.equal(await evaluate(() => document.querySelector('[data-notification-panel]').open), false);
  console.log('PASS reduced motion and backdrop dismissal');

  state.announcements.push(announcement('escaped', {title: '<img src=x onerror="window.__notificationXss=true">', body: '<script>window.__notificationXss=true</script>', updatedAt: new Date()})); content.clearCache();
  await open();
  assert(await evaluate(() => !window.__notificationXss && document.querySelectorAll('[data-notification-list] img, [data-notification-list] script').length === 0));
  await key('Escape', 'Escape', 27);

  reset(); content.clearCache();
  await evaluate(() => localStorage.clear());
  const blocked = await send('Page.addScriptToEvaluateOnNewDocument', {source: 'Storage.prototype.getItem=function(){throw new Error("blocked")};Storage.prototype.setItem=function(){throw new Error("blocked")};'});
  await navigate(base + '/'); await open();
  await evaluate(() => document.querySelector('[data-notification-read-all]').click());
  assert.deepEqual((await evaluate(metrics)).counts, ['0', '0']);
  assert(await evaluate(() => document.querySelector('[data-notification-status]').textContent.includes('this visit')));
  await key('Escape', 'Escape', 27);
  await send('Page.removeScriptToEvaluateOnNewDocument', {identifier: blocked.identifier});
  console.log('PASS safe notice rendering and unavailable browser storage');

  state.announcements = []; content.clearCache();
  await navigate(base + '/'); await open();
  assert.deepEqual((await evaluate(metrics)).counts, ['0', '0']);
  assert(await evaluate(() => document.querySelector('[data-notification-list]').textContent.includes('No notifications yet')));
  assert(await evaluate(() => document.querySelector('[data-notification-read-all]').disabled));
  await key('Escape', 'Escape', 27);
  await send('Emulation.setScriptExecutionDisabled', {value: true});
  await send('Page.navigate', {url: base + '/'});
  await until(() => evaluate(() => document.readyState === 'complete' && document.documentElement.classList.contains('no-js')), 'no-script page');
  assert(await evaluate(() => document.documentElement.classList.contains('no-js') && !document.querySelector('[data-notification-panel]').open));
  await evaluate(() => Array.from(document.querySelectorAll('[data-notification-trigger]')).find((button) => button.getClientRects().length).click());
  await until(() => evaluate((expected) => location.href === expected && document.readyState === 'complete', base + '/announcements'), 'no-script announcements fallback');
  assert(await evaluate(() => document.querySelector('main').textContent.includes('No announcements yet')));
  console.log('PASS zero notifications and usable fallback without JavaScript');
}
main().catch((error) => {console.error(error.message); process.exitCode = 1;}).finally(async () => {
  if (ws) ws.close(); if (chrome) chrome.kill();
  for (const command of pending.values()) clearTimeout(command.timeout);
  if (server) await new Promise((resolve) => server.close(resolve));
});
