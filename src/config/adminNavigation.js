// Admin panel sidebar.
module.exports = [
  { label: 'Dashboard', href: '/admin', icon: 'dashboard', exact: true },
  { label: 'Tutors', href: '/admin/tutors', icon: 'users' },
  { heading: 'Content' },
  { label: 'Page content', href: '/admin/pages', icon: 'page' },
  { label: 'Team members', href: '/admin/team', icon: 'person' },
  { label: 'Activities', href: '/admin/activities', icon: 'growth' },
  { label: 'Documents', href: '/admin/documents', icon: 'book' },
  { label: 'Announcements', href: '/admin/announcements', icon: 'megaphone' },
  { label: 'Partners', href: '/admin/partners', icon: 'handshake' },
  { heading: 'Gallery' },
  { label: 'Photo albums', href: '/admin/albums', icon: 'camera' },
  { label: 'Videos', href: '/admin/videos', icon: 'screen' },
];
