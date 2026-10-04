// Parses supported video sources into safe embeds or browser video sources.
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

  // Managed MP4 files use native controls. Only the public Cloudinary video endpoint is accepted.
  if (url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && !url.port && !url.username && !url.password && !url.search && !url.hash) {
    const match = /^\/([a-z0-9_-]+)\/video\/upload\/(.+)\.(mp4|webm|mov|m4v)$/i.exec(url.pathname);
    if (match) {
      const root = `https://res.cloudinary.com/${match[1]}/video/upload/`;
      return {
        provider: 'CLOUDINARY', embedUrl: url.href,
        videoUrl: `${root}f_mp4,vc_h264,ac_aac,q_auto,w_1280,c_limit/${match[2]}.mp4`,
        thumbnailUrl: `${root}so_1,f_auto,q_auto,w_640,c_limit/${match[2]}.jpg`,
      };
    }
  }

  return null;
}

function formatDuration(duration) {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return '';
  const seconds = Math.max(1, Math.floor(duration));
  const parts = [Math.floor(seconds / 60), String(seconds % 60).padStart(2, '0')];
  if (seconds >= 3600) parts.splice(0, 1, Math.floor(seconds / 3600), String(Math.floor(seconds / 60) % 60).padStart(2, '0'));
  return parts.join(':');
}

function presentVideo(video) {
  const parsed = parseVideoUrl(video.embedUrl);
  if (!parsed) return null;
  const isNative = parsed.provider === 'CLOUDINARY';
  return {
    ...video, ...parsed, isNative,
    isPortrait: isNative && video.width > 0 && video.height > video.width,
    durationLabel: formatDuration(video.duration),
    watchUrl: parsed.provider === 'YOUTUBE' ? `https://www.youtube.com/watch?v=${parsed.id}`
      : parsed.provider === 'VIMEO' ? `https://vimeo.com/${parsed.id}` : parsed.videoUrl,
  };
}

module.exports = { parseVideoUrl, presentVideo, formatDuration };
