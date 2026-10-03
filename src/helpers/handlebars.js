// Custom Handlebars helpers, registered in app.js.

function isActive(currentPath, href) {
  if (!currentPath || !href) return false;
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

module.exports = {
  year: () => new Date().getFullYear(),
  eq: (a, b) => a === b,
  or: (...args) => args.slice(0, -1).some(Boolean),
  and: (...args) => args.slice(0, -1).every(Boolean),
  not: (a) => !a,
  concat: (...args) => args.slice(0, -1).join(''),
  // First truthy argument: {{either metaImage site.logoUrl}}
  either: (...args) => args.slice(0, -1).find(Boolean),
  // Shorten text for meta descriptions, at a word boundary.
  truncate: (text, max) => {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, s.lastIndexOf(' ', max - 1) > 0 ? s.lastIndexOf(' ', max - 1) : max - 1)}…`;
  },
  // Make a site-relative URL absolute (for Open Graph tags).
  absoluteUrl: (url, base) => (typeof url === 'string' && url.startsWith('/') ? `${base}${url}` : url),
  isActive,
  // True when any child link of a dropdown item is active.
  isParentActive: (currentPath, children) =>
    Array.isArray(children) && children.some((child) => isActive(currentPath, child.href)),

  // Split text into paragraphs on blank lines (admin-entered text is plain, never HTML).
  paragraphs: (text) =>
    typeof text === 'string'
      ? text
          .split(/\r?\n\s*\r?\n/)
          .map((p) => p.trim())
          .filter(Boolean)
      : [],

  // Field definitions for the change-password form
  passwordFields: (minLength) => [
    { id: 'current-password', name: 'currentPassword', label: 'Current password', autocomplete: 'current-password' },
    {
      id: 'new-password',
      name: 'newPassword',
      label: 'New password',
      autocomplete: 'new-password',
      help: `At least ${minLength} characters.`,
    },
    { id: 'confirm-password', name: 'confirmPassword', label: 'Confirm new password', autocomplete: 'new-password' },
  ],

  // Value lookup on an object by key, e.g. {{get values field.name}}.
  get: (obj, key) => (obj && key != null ? obj[key] : undefined),

  // Join an array with newlines (for 'lines' textareas).
  joinLines: (value) => (Array.isArray(value) ? value.join('\n') : value || ''),

  formatDate: (date) => (date ? DATE_FORMAT.format(new Date(date)) : ''),

  // yyyy-mm-dd for <input type="date">
  dateInput: (date) => {
    if (!date) return '';
    if (typeof date === 'string') return date.slice(0, 10);
    return new Date(date).toISOString().slice(0, 10);
  },

  // "report.pdf" -> "PDF"
  fileExt: (name) => {
    const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
    return m ? m[1].toUpperCase() : 'File';
  },

  formatBytes: (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },

  // Cloudinary delivery transformation, e.g. {{img url "w_400,h_400,c_fill"}}.
  // Adds automatic format and quality; leaves non-Cloudinary URLs untouched.
  img: (url, transform) => {
    if (typeof url !== 'string' || !url.includes('/image/upload/')) return url;
    const t = ['f_auto', 'q_auto', typeof transform === 'string' ? transform : ''].filter(Boolean).join(',');
    return url.replace('/image/upload/', `/image/upload/${t}/`);
  },

  // Human-friendly enum labels, e.g. PENDING -> Pending, TUTORS -> Tutors only.
  // (Not named `label`: a helper would shadow every {{label}} property in templates.)
  enumLabel: (value) => {
    const labels = { PUBLIC: 'Public', TUTORS: 'Tutors only', YOUTUBE: 'YouTube', VIMEO: 'Vimeo' };
    if (labels[value]) return labels[value];
    return typeof value === 'string' ? value.charAt(0) + value.slice(1).toLowerCase() : value;
  },

  // Query-string builder for pagination links: {{pageUrl basePath 2}}
  pageUrl: (base, page) => `${base}?page=${page}`,
  add: (a, b) => Number(a) + Number(b),
  gt: (a, b) => a > b,
  lt: (a, b) => a < b,
};
