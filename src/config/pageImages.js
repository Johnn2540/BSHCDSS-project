// Photos used in page banners (partials/photo-hero.hbs). Optimised copies live in
// public/images/pages/; originals are kept in public/images/ but not deployed (.vercelignore).
//
// position / positionLg: CSS object-position used on phones and on desktop (lg+), chosen so
// the people in each photo stay in view when the banner crops it.

// Workshop photos for slideshows (partials/photo-slider.hbs). Optimised copies live in
// public/images/pages/workshop/ (never upscaled: landscape originals are 1280 px wide, portrait 960 px);
// the originals in public/images/ are not deployed (.vercelignore).
function slide(set, key, sizes, [width, height], alt, position = '50% 50%') {
  const file = (w) => `/images/pages/workshop/${set}-${key}-${w}.webp`;
  return {
    src: file(sizes[1]),
    srcset: sizes.map((w) => `${file(w)} ${w}w`).join(', '),
    width,
    height,
    alt,
    position,
  };
}
const landscape = (key, alt, position) => slide('landscape', key, [640, 960, 1280], [1280, 960], alt, position);
const portrait = (key, alt, position) => slide('portrait', key, [480, 720, 960], [960, 1280], alt, position);

const landscapeSlides = [
  landscape('a', 'Facilitators supporting participants at laptops during a training workshop', '45% 55%'),
  landscape('b', 'Participants working on laptops at desks in a large training room', '55% 55%'),
  landscape('c', 'A facilitator helping a participant at a laptop while colleagues look on', '60% 45%'),
  landscape('d', 'Participants and facilitators talking during a hands-on training session', '70% 45%'),
  landscape('e', 'Participants working at desks in a training room', '40% 55%'),
];

module.exports = {
  // Slideshows used when a page photo has not been replaced by an upload in the admin.
  slideshows: {
    // Home, wide banner under "About the project"; About, "The training in pictures".
    landscape: landscapeSlides,
    // Home, beside the statistics.
    portrait: [
      portrait('a', 'Participants working on laptops at tables during a training workshop', '50% 55%'),
      portrait('b', 'Participants at laptops around a table in the training hall', '50% 55%'),
      portrait('c', 'A participant typing on a laptop as other groups work behind in the training room', '45% 60%'),
      portrait('d', 'Participants gathered for a discussion during a group session in the training hall', '50% 40%'),
      portrait('e', 'Participants seated at tables with laptops while a group talks behind them', '50% 50%'),
      portrait('f', 'Participants seated at tables facing the front of the training hall', '50% 60%'),
    ],
  },

  contact: {
    srcset:
      '/images/pages/contact-480.webp 480w, /images/pages/contact-800.webp 800w, /images/pages/contact-1200.webp 1200w, /images/pages/contact-1600.webp 1600w',
    fallback: '/images/pages/contact-1200.jpg',
    width: 1200,
    height: 1800,
    position: '62% 18%',
    positionLg: '58% 22%',
  },
  // Home banner when no photo has been uploaded (Admin -> Page content -> Home -> Banner photo).
  homeDefault: {
    srcset: '/images/pages/about-480.webp 480w, /images/pages/about-800.webp 800w, /images/pages/about-960.webp 960w',
    fallback: '/images/pages/about-960.jpg',
    width: 960,
    height: 1280,
    position: '45% 42%',
    positionLg: '42% 50%',
  },
  // Home "Why teacher training matters" photo when none has been uploaded (Admin -> Page content -> Home).
  statsDefault: {
    srcset: '/images/pages/stats-640.jpg 640w, /images/pages/stats-1140.jpg 1140w',
    src: '/images/pages/stats-1140.jpg',
    width: 1140,
    height: 760,
    position: '53% 30%',
  },
  // Home "About the project" banner photo when none has been uploaded (Admin -> Page content -> Home).
  // 16:10 originals; the banner crops them to 3:1 on desktop, centred on the people.
  introDefault: {
    srcset: '/images/pages/intro-640.jpg 640w, /images/pages/intro-1200.jpg 1200w, /images/pages/intro-1448.jpg 1448w',
    src: '/images/pages/intro-1200.jpg',
    width: 1200,
    height: 750,
    position: '50% 45%',
  },
  // Built-in 16:9 photos for the "What the project does" cards and the top of each section page,
  // keyed by activity slug (or "curriculum"). An uploaded image (Admin) replaces them.
  focus: {
    curriculum: {
      srcset: '/images/pages/focus-1-640.jpg 640w, /images/pages/focus-1-1200.jpg 1200w',
      src: '/images/pages/focus-1-1200.jpg', width: 1200, height: 675, position: '50% 35%',
      alt: 'Trainers and participants talking at a teacher training workshop',
    },
    'in-service-training': {
      srcset: '/images/pages/focus-2-640.jpg 640w, /images/pages/focus-2-1086.jpg 1086w',
      src: '/images/pages/focus-2-1086.jpg', width: 1086, height: 611, position: '50% 50%',
      alt: 'Teachers working at laptops during an in-service training session',
    },
    cpd: {
      srcset: '/images/pages/focus-3-640.jpg 640w, /images/pages/focus-3-1086.jpg 1086w',
      src: '/images/pages/focus-3-1086.jpg', width: 1086, height: 611, position: '50% 50%',
      alt: 'A trainer guiding a teacher at a laptop during professional development',
    },
    lms: {
      srcset: '/images/pages/focus-4-640.jpg 640w, /images/pages/focus-4-1200.jpg 1200w',
      src: '/images/pages/focus-4-1200.jpg', width: 1200, height: 675, position: '50% 50%',
      alt: 'Teachers learning together on laptops in a training room',
    },
  },
  about: {
    // Original is 960px wide, so no larger versions are made (they would only be blurrier).
    srcset: '/images/pages/about-480.webp 480w, /images/pages/about-800.webp 800w, /images/pages/about-960.webp 960w',
    fallback: '/images/pages/about-960.jpg',
    width: 960,
    height: 1280,
    alt: 'Participants working together at laptops around tables during a workshop',
    position: '45% 42%',
    positionLg: '40% 45%',
  },
};
