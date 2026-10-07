// Read-only public-page checks against the local app, or --live after deployment.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pending = new Map();
let server, db, chrome, ws, commandId = 0;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(fn, ...args) {
  const expression = '(' + fn.toString() + ')(' + args.map((value) => JSON.stringify(value)).join(',') + ')';
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(check, label) {
  const started = Date.now();
  while (Date.now() - started < 30000) { if (await check()) return; await delay(100); }
  throw new Error('Timed out: ' + label);
}
async function navigate(url) {
  await send('Page.navigate', { url });
  await until(() => evaluate((expected) => location.href === expected && document.readyState === 'complete', url), 'load ' + url);
  await delay(550);
}
function snapshot() {
  const visible = (element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
  return {
    heading: document.querySelector('main h1')?.textContent,
    headingCount: document.querySelectorAll('main h1').length,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    errors: window.__browserErrors || [],
    unreadable: Array.from(document.querySelectorAll('main [data-motion], main .section-heading, .auth-card > h1')).filter(visible)
      .filter(element => Number(getComputedStyle(element).opacity) < 0.7 || getComputedStyle(element).visibility !== 'visible').length,
    links: Array.from(document.querySelectorAll('main a[href]')).map(link => link.getAttribute('href')),
    forms: Array.from(document.querySelectorAll('main form')).map(form => ({
      action: form.getAttribute('action'), method: form.method,
      fields: Array.from(form.querySelectorAll('input, select, textarea, button')).map(field => ({
        name: field.name, type: field.type, required: field.required, autocomplete: field.autocomplete,
      })),
    })),
  };
}
async function assertReadable(label) {
  const result = await evaluate(snapshot);
  assert.equal(result.headingCount, 1, label + ': main heading');
  assert.equal(result.overflow, false, label + ': horizontal overflow');
  assert.equal(result.unreadable, 0, label + ': content remains visible');
  assert.deepEqual(result.errors, [], label + ': browser errors');
  return result;
}

async function main() {
  let base = 'https://kubshcdss.com';
  if (!process.argv.includes('--live')) {
    const app = require('../src/app'); db = require('../src/lib/db');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
  }
  const port = 9800 + process.pid % 200;
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions', '--no-proxy-server',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + path.join(os.tmpdir(), 'bshcdss-motion-check-' + process.pid), 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let target;
  await until(async () => { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(page => page.type === 'page'); return Boolean(target); } catch { return false; } }, 'browser start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const result = JSON.parse(event.data), command = pending.get(result.id);
    if (!command) return;
    clearTimeout(command.timeout); pending.delete(result.id);
    if (result.error) command.reject(new Error(result.error.message)); else command.resolve(result.result);
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + function () {
    window.__browserErrors = []; window.__motionRecords = [];
    window.addEventListener('error', event => { if (event.message) window.__browserErrors.push(event.message); });
    window.addEventListener('unhandledrejection', event => window.__browserErrors.push(String(event.reason)));
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      window.__motionRecords.push({ element: this, duration: options.duration });
      return original.call(this, frames, options);
    };
  }.toString() + ')();' });
  await fs.mkdir(path.join(__dirname, '../.artifacts'), { recursive: true });
  const routes = ['/', '/about', '/team', '/curriculum', '/contact', '/gallery',
    '/gallery/project-coordination-and-engagement', '/activities/in-service-training', '/activities/cpd',
    '/activities/lms', '/login', '/forgot-password'];

  for (const width of process.argv.includes('--interactions-only') ? [] : [320, 390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    for (const route of routes) {
      const url = base + route;
      // Compare page actions with and without the optional entrance script.
      await send('Network.setBlockedURLs', { urls: ['*/js/motion.js*'] });
      await navigate(url); const baseline = await assertReadable(route + ' baseline at ' + width);
      await send('Network.setBlockedURLs', { urls: [] });
      await navigate(url); const animated = await assertReadable(route + ' animated at ' + width);
      assert.deepEqual(animated.forms, baseline.forms, route + ': form contracts unchanged');
      assert.deepEqual(animated.links, baseline.links, route + ': navigation/downloads unchanged');
      if (route === '/') {
        await evaluate(() => document.querySelector('#home-title').scrollIntoView({ block: 'center' }));
        await delay(100);
        assert.ok(await evaluate(() => window.__motionRecords.length > 0), 'Home entrance effects');
        await delay(500);
        const targetSelector = '.stat-card';
        if (await evaluate(selector => Boolean(document.querySelector(selector)), targetSelector)) {
          await evaluate(selector => document.querySelector(selector).scrollIntoView({ block: 'center' }), targetSelector);
          await delay(600);
          const before = await evaluate(selector => window.__motionRecords.filter(record => record.element === document.querySelector(selector)).length, targetSelector);
          assert.equal(before, 1, 'Statistics enter once');
          await evaluate(() => scrollTo(0, 0)); await delay(100);
          await evaluate(selector => document.querySelector(selector).scrollIntoView({ block: 'center' }), targetSelector);
          await delay(100);
          assert.equal(await evaluate(selector => window.__motionRecords.filter(record => record.element === document.querySelector(selector)).length, targetSelector), before, 'No replay on scrolling back');
        }
        await evaluate(() => scrollTo(0, 0)); await delay(500);
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await fs.writeFile(path.join(__dirname, '../.artifacts/motion-home-' + width + '.png'), Buffer.from(shot.data, 'base64'));
      }
    }
    console.log('Verified all 12 public/auth pages at ' + width + 'px; form and link contracts unchanged.');
  }

  if (process.argv.includes('--live')) {
    for (const [route, email] of [['/team', 'ogola.martin@ku.ac.ke'], ['/', 'kussdproject@gmail.com']]) {
      await navigate(base + route);
      await until(() => evaluate(expected => Array.from(document.querySelectorAll('a[href]')).some(link => link.getAttribute('href') === 'mailto:' + expected), email), 'usable contact email on ' + route);
      await assertReadable(route + ' with Cloudflare email protection');
    }
    console.log('Verified project and team contact links after Cloudflare email decoding.');
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await navigate(base + '/');
  await evaluate(() => { const button = document.querySelector('[data-drawer-open]'); button.focus(); button.click(); });
  await until(() => evaluate(() => document.activeElement.hasAttribute('data-drawer-close')), 'drawer focus');
  assert.ok(await evaluate(() => document.querySelector('#site-drawer').classList.contains('is-open') && document.documentElement.classList.contains('drawer-locked')));
  await evaluate(() => {
    const drawer = document.querySelector('#site-drawer');
    const links = Array.from(drawer.querySelectorAll('a[href], button')).filter(element => element.offsetParent !== null);
    links[links.length - 1].focus();
  });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.ok(await evaluate(() => {
    const items = Array.from(document.querySelector('#site-drawer').querySelectorAll('a[href], button:not([disabled])')).filter(element => element.offsetParent !== null);
    return document.activeElement === items[0];
  }), 'Drawer cycles keyboard focus to its first link');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.ok(await evaluate(() => document.activeElement.hasAttribute('data-drawer-open') && !document.documentElement.classList.contains('drawer-locked')), 'Escape closes menu and restores focus');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(base + '/');
  await evaluate(() => document.querySelector('[data-dropdown-toggle]').focus());
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  assert.ok(await evaluate(() => document.activeElement.closest('[data-dropdown-menu]') !== null), 'Dropdown keyboard entry');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.ok(await evaluate(() => document.activeElement.hasAttribute('data-dropdown-toggle')), 'Dropdown Escape restores focus');

  await navigate(base + '/curriculum');
  await evaluate(() => { document.querySelector('#document-search').value = 'Mathematics'; document.querySelector('form.library-search').requestSubmit(); });
  await until(() => evaluate(() => location.search.includes('q=Mathematics') && document.readyState === 'complete' && document.querySelector('#document-search')?.value === 'Mathematics'), 'search submission');
  assert.ok(await evaluate(() => document.querySelectorAll('.document-download').length > 0), 'Search/downloads work');
  await navigate(base + '/contact');
  assert.ok(await evaluate(() => Array.from(document.querySelector('form[action="/contact"]').querySelectorAll('input, textarea, button')).every(element => !element.closest('[data-motion]'))), 'Contact controls remain outside moving containers');
  await navigate(base + '/login');
  await evaluate(() => document.querySelector('[data-password-toggle]').click());
  assert.equal(await evaluate(() => document.querySelector('#password').type), 'text');
  await evaluate(() => document.querySelector('[data-password-toggle]').click());
  assert.equal(await evaluate(() => document.querySelector('#password').type), 'password');
  await navigate(base + '/gallery#videos');
  assert.ok(await evaluate(() => { const video = document.querySelector('[data-project-video]'); return video && video.controls && video.paused && video.preload === 'none'; }), 'Video retains native controls and no autoplay');
  console.log('Verified keyboard menus, search, password controls, stable contact fields and native video behavior.');

  await navigate(base + '/');
  await evaluate(() => document.querySelector('#contact-heading').scrollIntoView({ block: 'center' }));
  await until(() => evaluate(() => document.querySelector('#contact-heading').closest('[data-motion]').getAnimations().length > 0), 'focusable entrance');
  const focusCleanup = await evaluate(() => {
    const block = document.querySelector('#contact-heading').closest('[data-motion]');
    const link = block.querySelector('a'); link.focus();
    return { focused: document.activeElement === link, animations: block.getAnimations().map(animation => animation.playState), transform: getComputedStyle(block).transform };
  });
  assert.equal(focusCleanup.focused, true, 'Link receives keyboard focus');
  assert.deepEqual(focusCleanup.animations, [], 'Focus cancels the active entrance: ' + JSON.stringify(focusCleanup));
  assert.equal(focusCleanup.transform, 'none', 'Focus removes the presentation transform');
  await navigate(base + '/');
  await evaluate(() => document.querySelector('#contact-heading').scrollIntoView({ block: 'center' }));
  await until(() => evaluate(() => document.querySelector('#contact-heading').closest('[data-motion]').getAnimations().length > 0), 'printable entrance');
  await evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  assert.equal(await evaluate(() => document.querySelector('#contact-heading').closest('[data-motion]').getAnimations().length), 0, 'Printing cancels active entrances');
  console.log('Verified immediate focus safety and print cleanup.');

  // Scroll-linked photo zoom: normal size at load, grows gently and only within its limit while scrolling,
  // always inside a clipping frame, and plain again for printing.
  const photoScales = () => evaluate(() => Array.from(document.querySelectorAll('img[data-scroll-zoom]')).map(image => {
    const transform = getComputedStyle(image).transform;
    return transform === 'none' ? 1 : Number(transform.match(/matrix\(([^,]+)/)[1]);
  }));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(base + '/');
  assert.ok((await photoScales()).length >= 5, 'Home photos opt in to the scroll zoom');
  assert.ok((await photoScales()).every(scale => Math.abs(scale - 1) < 0.002 || scale > 1), 'Photos never shrink');
  assert.ok(await evaluate(() => Array.from(document.querySelectorAll('img[data-scroll-zoom]')).every(image => {
    for (let element = image.parentElement; element && element !== document.body; element = element.parentElement) {
      if (getComputedStyle(element).overflow !== 'visible') return true;
    }
    return false;
  })), 'Every zoomed photo sits inside a clipping frame');
  assert.ok(Math.abs((await photoScales())[0] - 1) < 0.002, 'The photo on screen at load starts at its normal size');
  let previousScale = 1;
  for (const y of [200, 400, 600, 800]) {
    await evaluate(offset => scrollTo(0, offset), y); await delay(150);
    const scale = (await photoScales())[0];
    assert.ok(scale >= previousScale - 0.0015, 'The banner photo only grows while scrolling down: ' + scale);
    previousScale = scale;
  }
  assert.ok(previousScale > 1.02 && previousScale <= 1.1001, 'The banner photo zooms gently within its limit: ' + previousScale);
  assert.equal(await evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Zoomed photos cause no horizontal overflow');
  await evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  assert.ok((await photoScales()).every(scale => scale === 1), 'Printing shows photos at normal size');
  await evaluate(() => window.dispatchEvent(new Event('afterprint')));
  console.log('Verified scroll-linked photo zoom, clipping frames and print cleanup.');

  // Expanding frames start smaller while below the screen and are exactly full size once well up it.
  const frameScales = () => evaluate(() => Array.from(document.querySelectorAll('[data-scroll-expand]')).map(frame => {
    const transform = getComputedStyle(frame).transform;
    return transform === 'none' ? 1 : parseFloat(transform.slice(transform.indexOf('(') + 1));
  }));
  await navigate(base + '/');
  assert.ok((await frameScales()).length >= 2, 'Home frames opt in to expansion');
  assert.ok((await frameScales()).every(scale => scale >= 0.85 && scale < 1), 'Frames still below the screen start smaller than full size: ' + (await frameScales()));
  await evaluate(() => document.querySelector('[data-scroll-expand]').scrollIntoView({ block: 'start' })); await delay(400);
  assert.equal((await frameScales())[0], 1, 'A frame is exactly full size once it reaches the upper screen');
  await evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  assert.ok((await frameScales()).every(scale => scale === 1), 'Printing shows frames at full size');
  await evaluate(() => window.dispatchEvent(new Event('afterprint')));
  assert.equal(await evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Expanding frames cause no horizontal overflow');
  console.log('Verified expanding frames and print cleanup.');

  await navigate(base + '/');
  await evaluate(() => document.querySelector('#contact-heading').scrollIntoView({ block: 'center' }));
  await until(() => evaluate(() => Array.from(document.querySelectorAll('[data-motion]')).some(element => element.getAnimations().length > 0)), 'active entrance');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await delay(100);
  assert.equal(await evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0, 'Changing preference stops active motion');
  for (const route of routes) {
    await navigate(base + route); await assertReadable(route + ' reduced motion');
    assert.equal(await evaluate(() => window.__motionRecords.length), 0, route + ': no JS animation under reduced motion');
    assert.equal(await evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0, route + ': no CSS animation under reduced motion');
    await evaluate(() => scrollTo(0, 900)); await delay(150);
    assert.ok(await evaluate(() => Array.from(document.querySelectorAll('img[data-scroll-zoom], [data-scroll-expand]')).every(element => getComputedStyle(element).transform === 'none')), route + ': photos and frames stay at normal size under reduced motion');
  }
  console.log('Verified all public/auth pages with reduced motion, including a live preference change.');

  // Disable actual browser script execution, rather than changing a CSS class.
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  for (const route of ['/', '/curriculum', '/contact', '/gallery', '/login']) {
    await navigate(base + route); await assertReadable(route + ' without JavaScript');
    assert.ok(await evaluate(() => document.documentElement.classList.contains('no-js')), 'No-script fallback');
  }
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  await navigate(base + '/');
  // Simulate an unsupported animation API: content and existing site behavior still work.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Element.prototype.animate = undefined;' });
  await navigate(base + '/login'); await assertReadable('Unsupported animation API');
  await evaluate(() => document.querySelector('[data-password-toggle]').click());
  assert.equal(await evaluate(() => document.querySelector('#password').type), 'text');
  console.log('Verified usable content/forms without JavaScript or animation support.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (ws) ws.close(); if (chrome) chrome.kill();
  for (const command of pending.values()) clearTimeout(command.timeout);
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) { await db.prisma.$disconnect(); await db.pool.end(); }
});
