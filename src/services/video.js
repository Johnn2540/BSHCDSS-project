// Parses YouTube and Vimeo links into a provider, video ID and privacy-friendly embed URL.
// Accepts the usual share formats, e.g.
//   https://www.youtube.com/watch?v=ID   https://youtu.be/ID   https://www.youtube.com/embed/ID
//   https://www.youtube.com/shorts/ID    https://vimeo.com/ID  https://player.vimeo.com/video/ID

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

function parseVideoUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const host = url.hostname.replace(/^www\.|^m\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  let youtubeId = null;
  if (host === 'youtu.be') youtubeId = parts[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') youtubeId = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) youtubeId = parts[1];
  }
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return {
      provider: 'YOUTUBE',
      id: youtubeId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`,
    };
  }

  let vimeoId = null;
  if (host === 'vimeo.com') vimeoId = parts.find((p) => VIMEO_ID.test(p));
  else if (host === 'player.vimeo.com' && parts[0] === 'video') vimeoId = parts[1];
  if (vimeoId && VIMEO_ID.test(vimeoId)) {
    return { provider: 'VIMEO', id: vimeoId, embedUrl: `https://player.vimeo.com/video/${vimeoId}`, thumbnailUrl: null };
  }

  return null;
}

module.exports = { parseVideoUrl };
