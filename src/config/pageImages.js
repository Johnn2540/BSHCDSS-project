// Photos used in page banners (partials/photo-hero.hbs). Optimised copies live in
// public/images/pages/; originals are kept in public/images/ but not deployed (.vercelignore).
//
// position / positionLg: CSS object-position used on phones and on desktop (lg+), chosen so
// the people in each photo stay in view when the banner crops it.

module.exports = {
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
