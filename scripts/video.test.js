const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Handlebars = require('handlebars').create();
const { parseVideoUrl, presentVideo, formatDuration } = require('../src/services/video');
const helpers = require('../src/helpers/handlebars');
for (const [name, helper] of Object.entries(helpers)) Handlebars.registerHelper(name, helper);
const render = Handlebars.compile(fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'partials', 'video-cards.hbs'), 'utf8'));
const url = 'https://res.cloudinary.com/test/video/upload/v123/bshcdss/videos/session.mp4';

test('Cloudinary video URLs preserve version and asset identity in browser sources and posters', () => {
  const parsed = parseVideoUrl(url);
  assert.equal(parsed.provider, 'CLOUDINARY');
  assert.equal(parsed.embedUrl, url);
  assert.match(parsed.videoUrl, /f_mp4,vc_h264,ac_aac,q_auto,w_1280,c_limit\/v123\/bshcdss\/videos\/session\.mp4$/);
  assert.match(parsed.thumbnailUrl, /so_1,f_auto,q_auto,w_640,c_limit\/v123\/bshcdss\/videos\/session\.jpg$/);
  assert.equal(parseVideoUrl(url.replace('.mp4', '.mov')).videoUrl, parsed.videoUrl);
});

test('untrusted hosts, private types and invalid video links are rejected', () => {
  for (const source of ['javascript:alert(1)', 'https://res.cloudinary.com.evil.example/test/video/upload/clip.mp4',
    'https://evil.example/clip.mp4', url.replace('https:', 'http:'), url.replace('/video/upload/', '/raw/upload/'),
    url.replace('res.cloudinary.com', 'user:pass@res.cloudinary.com'), url + '?redirect=elsewhere', url.replace('.mp4', '.pdf')]) {
    assert.equal(parseVideoUrl(source), null, source);
    assert.equal(presentVideo({ embedUrl: source }), null);
  }
});

test('YouTube and Vimeo share links keep their existing privacy-friendly players', () => {
  for (const source of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ']) {
    const video = presentVideo({ embedUrl: source });
    assert.equal(video.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    assert.equal(video.watchUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(video.isNative, false);
  }
  assert.equal(presentVideo({ embedUrl: 'https://vimeo.com/123456789' }).embedUrl, 'https://player.vimeo.com/video/123456789');
});

test('duration and orientation are derived from actual video metadata', () => {
  assert.equal(formatDuration(40.874667), '0:40');
  assert.equal(formatDuration(3601), '1:00:01');
  assert.equal(formatDuration(null), '');
  assert.equal(formatDuration(Infinity), '');
  assert.equal(presentVideo({ embedUrl: url, width: 478, height: 850, duration: 40.874667 }).isPortrait, true);
  assert.equal(presentVideo({ embedUrl: url, width: 1280, height: 720 }).isPortrait, false);
});

test('uploaded videos render native controls without autoplay or a full download on page load', () => {
  const html = render({ videos: [presentVideo({ title: 'Participant session', embedUrl: url, width: 478, height: 850, duration: 40.874667 })] });
  assert.match(html, /<video controls playsinline preload="none"/);
  assert.match(html, /poster="https:\/\/res\.cloudinary\.com\//);
  assert.match(html, /aria-label="Participant session"/);
  assert.match(html, /type="video\/mp4"/);
  assert.match(html, /aspect-\[9\/16\]/);
  assert.match(html, /0:40/);
  assert.doesNotMatch(html, /autoplay|data-video-embed|<iframe/);
});

test('external embeds remain click-to-play and titles are escaped', () => {
  const html = render({ videos: [presentVideo({ title: '<script>alert(1)</script>', embedUrl: 'https://vimeo.com/123456789' })] });
  assert.match(html, /data-video-embed="https:\/\/player\.vimeo\.com\/video\/123456789"/);
  assert.doesNotMatch(html, /<video|<iframe|<script>/);
  assert.match(html, /&lt;script&gt;/);
});
