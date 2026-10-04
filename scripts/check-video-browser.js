const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let chrome, ws, id = 0;
const pending = new Map();
const mediaRequests = [];
const mediaResponses = [];
const securityErrors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const command = ++id;
    const timeout = setTimeout(() => { pending.delete(command); reject(new Error('Timed out: ' + method)); }, 30000);
    pending.set(command, { resolve, reject, timeout }); ws.send(JSON.stringify({ id: command, method, params }));
  });
}
async function evaluate(expression) {
  const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (value.exceptionDetails) throw new Error('Browser evaluation failed: ' + (value.exceptionDetails.text || 'unknown'));
  return value.result.value;
}
async function until(check, label, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await check()) return; await delay(200); }
  throw new Error('Timed out: ' + label);
}
async function clickPlay() {
  const point = await evaluate(`(() => {
    const v = document.querySelector('[data-project-video]'), r = v.getBoundingClientRect(); v.muted = true;
    return {x: r.left + 24, y: r.bottom - 48};
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await delay(200);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function main() {
  const base = process.env.CHECK_BASE_URL || 'http://localhost:3000';
  const response = await fetch(base + '/gallery');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Participant engagement session/);
  assert.match(html, /data-project-video/);
  assert.match(response.headers.get('content-security-policy'), /media-src 'self' https:\/\/res\.cloudinary\.com/);
  assert.equal((await fetch(base + '/admin/videos', { redirect: 'manual' })).headers.get('location'), '/login');

  const port = 9900 + process.pid % 200;
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-extensions', '--no-proxy-server', '--remote-debugging-port=' + port,
    '--user-data-dir=' + path.join(os.tmpdir(), 'bshcdss-video-check-' + process.pid), 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let target;
  await until(async () => {
    try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find((page) => page.type === 'page'); return Boolean(target); }
    catch { return false; }
  }, 'browser start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', (event) => {
    const result = JSON.parse(event.data), command = pending.get(result.id);
    if (result.method === 'Network.requestWillBeSent' && result.params.type === 'Media') mediaRequests.push(result.params.request.url);
    if (result.method === 'Network.responseReceived' && result.params.type === 'Media') mediaResponses.push(result.params.response);
    if (result.method === 'Log.entryAdded' && /Content Security Policy|Refused to load media/i.test(result.params.entry.text)) securityErrors.push(result.params.entry.text);
    if (!command) return;
    clearTimeout(command.timeout); pending.delete(result.id);
    if (result.error) command.reject(new Error(result.error.message)); else command.resolve(result.result);
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
  for (const width of [320, 390, 768, 1440]) {
    mediaRequests.length = 0;
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    const pageUrl = base + '/gallery?video-check=' + width + '#videos';
    await send('Page.navigate', { url: pageUrl });
    await until(() => evaluate('location.href === ' + JSON.stringify(pageUrl) + ' && document.readyState === "complete" && !!document.querySelector("[data-project-video]")'), 'gallery load');
    await evaluate('document.querySelector("[data-project-video]").scrollIntoView({block: "center"});');
    await until(() => evaluate('new Promise(resolve => { const i = new Image(); i.onload = () => resolve(true); i.onerror = () => resolve(false); i.src = document.querySelector("[data-project-video]").poster; })'), 'poster delivery');
    const state = await evaluate(`(() => {
      const v = document.querySelector('[data-project-video]'), r = v.getBoundingClientRect(), c = v.closest('[data-video-card]').getBoundingClientRect();
      return {width: innerWidth, scroll: document.documentElement.scrollWidth, controls: v.controls, playsInline: v.playsInline,
        preload: v.preload, paused: v.paused, time: v.currentTime, autoplay: v.autoplay, fit: getComputedStyle(v).objectFit,
        player: {width: r.width, height: r.height}, source: v.querySelector('source').src,
        clip: {x: c.left + scrollX, y: c.top + scrollY, width: c.width, height: c.height, scale: 1}};
    })()`);
    assert.ok(state.scroll <= state.width + 1, 'Horizontal overflow at ' + width);
    assert.equal(state.controls, true); assert.equal(state.playsInline, true); assert.equal(state.preload, 'none');
    assert.equal(state.paused, true); assert.equal(state.autoplay, false); assert.equal(state.fit, 'contain');
    assert.equal(state.time, 0, 'Each check must use a freshly loaded, unplayed video.');
    assert.ok(Math.abs(state.player.width - state.clip.width + 2) < 2, 'Player should fill its card width.');
    assert.ok(state.player.height > state.player.width, 'Portrait frame missing at ' + width);
    assert.ok(state.source.includes('res.cloudinary.com') && state.source.includes('vc_h264'));
    assert.equal(mediaRequests.length, 0, 'Video should not download before play.');
    if (width === 390 || width === 1440) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: state.clip });
      await fs.mkdir(path.join(__dirname, '..', '.artifacts'), { recursive: true });
      await fs.writeFile(path.join(__dirname, '..', '.artifacts', 'video-' + width + '.png'), Buffer.from(shot.data, 'base64'));
    }
    await clickPlay();
    await until(() => evaluate('!document.querySelector("[data-project-video]").paused && document.querySelector("[data-project-video]").currentTime > 0.3'), 'native play at ' + width, 60000);
    const playback = await evaluate('({duration: document.querySelector("[data-project-video]").duration, width: document.querySelector("[data-project-video]").videoWidth, height: document.querySelector("[data-project-video]").videoHeight, error: document.querySelector("[data-project-video]").error?.code})');
    assert.ok(playback.duration > 40 && playback.duration < 42); assert.equal(playback.error, undefined);
    assert.ok(Math.abs(playback.width / playback.height - 478 / 850) < 0.01, 'Video frame distorted.');
    await evaluate('document.querySelector("[data-project-video]").pause(); document.querySelector("[data-project-video]").currentTime = 20;');
    await until(() => evaluate('!document.querySelector("[data-project-video]").seeking && document.querySelector("[data-project-video]").readyState >= 2 && Math.abs(document.querySelector("[data-project-video]").currentTime - 20) < 0.5'), 'seek at ' + width);
    console.log('Verified poster, play, seek and portrait layout at ' + width + 'px.');
  }
  assert.ok(mediaResponses.some(response => [200, 206].includes(response.status) && response.mimeType.startsWith('video/mp4')), 'Successful MP4 delivery missing.');
  assert.equal(securityErrors.length, 0, 'A content security policy blocked media.');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  const noScriptUrl = base + '/gallery?video-check=no-script#videos';
  await send('Page.navigate', { url: noScriptUrl });
  await until(() => evaluate('location.href === ' + JSON.stringify(noScriptUrl) + ' && document.readyState === "complete" && !!document.querySelector("[data-project-video]")'), 'no-JavaScript page');
  await evaluate('document.querySelector("[data-project-video]").scrollIntoView({block: "center"});');
  await clickPlay();
  await until(() => evaluate('!document.querySelector("[data-project-video]").paused && document.querySelector("[data-project-video]").currentTime > 0'), 'play without JavaScript');
  console.log('Verified video playback without JavaScript, MP4 delivery and protected admin access.');
}
main().catch(async (error) => {
  console.error(error.message);
  if (ws) {
    try {
      console.error(JSON.stringify(await evaluate('(() => { const v = document.querySelector("[data-project-video]"); return v ? {paused:v.paused, time:v.currentTime, ready:v.readyState, error:v.error?.message, source:v.currentSrc} : {}; })()')));
      console.error(JSON.stringify(mediaResponses.map(response => ({ status: response.status, mimeType: response.mimeType, cloudError: response.headers['X-Cld-Error'] || response.headers['x-cld-error'] }))));
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(__dirname, '..', '.artifacts', 'video-failure.png'), Buffer.from(shot.data, 'base64'));
    } catch {}
  }
  process.exitCode = 1;
}).finally(() => {
  if (ws) ws.close(); if (chrome) chrome.kill(); for (const command of pending.values()) clearTimeout(command.timeout);
});
