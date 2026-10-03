// Main site navigation, in the order defined in CLAUDE.md.
// Used by the desktop nav, the mobile menu and the footer quick links.
// The Project Activities children are filled from the database (see middleware/siteLocals.js);
// the list below is only the fallback order/labels.
module.exports = [
  { label: 'Home', href: '/' },
  { label: 'About BSHCDSS', href: '/about' },
  { label: 'Project Team', href: '/team' },
  { label: 'Curriculum Design and Development', href: '/curriculum' },
  {
    label: 'Project Activities',
    children: [
      { label: 'In-Service Teacher Training', href: '/activities/in-service-training' },
      { label: 'Continuous Professional Development', href: '/activities/cpd' },
      { label: 'Digital Learning Management System', href: '/activities/lms' },
    ],
  },
  { label: 'Project in Pictures and Videos', href: '/gallery' },
  { label: 'Contact', href: '/contact' },
];
