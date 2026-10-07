// Edge caching applies only to cookie-less anonymous GETs of a short list of form-free public pages.
const test = require('node:test');
const assert = require('node:assert/strict');
const { edgeCachePublic } = require('../src/middleware/security');

function run(req, setCookie) {
  const headers = {};
  const res = {
    writeHead() { return this; },
    set(name, value) { headers[name] = value; return this; }, setHeader(name, value) { headers[name] = value; },
    getHeader: (name) => (name === 'Set-Cookie' ? setCookie : headers[name]), vary(name) { headers.Vary = name; return this; },
  };
  edgeCachePublic({ method: 'GET', url: req.path, headers: {}, user: null, ...req }, res, () => {});
  res.writeHead(200);
  return headers;
}

test('cacheable only on Vercel, for anonymous cookie-less GETs of listed pages', () => {
  process.env.VERCEL = '1';
  try {
    assert.match(run({ path: '/' })['Cache-Control'], /s-maxage=60/);
    assert.match(run({ path: '/about' })['Cache-Control'], /public/);
    for (const request of [
      { path: '/login' }, { path: '/contact' }, { path: '/curriculum' }, { path: '/request-tutor-access' }, { path: '/admin' },
      { path: '/', method: 'POST' }, { path: '/', headers: { cookie: 'sid=1' } }, { path: '/', user: { id: 'u' } }, { path: '/gallery', url: '/gallery?x=1' },
    ]) assert.equal(run(request)['Cache-Control'], undefined, JSON.stringify(request));
    assert.equal(run({ path: '/' }, ['sid=1'])['Cache-Control'], 'private, no-store', 'a response that sets a cookie is never shared');
  } finally { delete process.env.VERCEL; }
  assert.equal(run({ path: '/' })['Cache-Control'], undefined, 'no caching outside Vercel');
});
