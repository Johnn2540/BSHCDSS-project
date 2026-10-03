const { prisma } = require('../../lib/db');
const { isCloudinaryConfigured } = require('../../services/storage');

async function dashboard(req, res) {
  const [tutorGroups, team, activities, albums, photos, videos, documents, announcements, partners, pending, recentAnnouncements] =
    await Promise.all([
      prisma.user.groupBy({ by: ['status'], where: { role: 'TUTOR' }, _count: { _all: true } }),
      prisma.teamMember.count(),
      prisma.activity.count(),
      prisma.album.count(),
      prisma.photo.count(),
      prisma.video.count(),
      prisma.document.count(),
      prisma.announcement.count(),
      prisma.partner.count(),
      prisma.user.findMany({
        where: { role: 'TUTOR', status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: { id: true, name: true, email: true, institution: true, createdAt: true },
      }),
      prisma.announcement.findMany({ orderBy: { publishedAt: 'desc' }, take: 5, select: { id: true, title: true, publishedAt: true, audience: true } }),
    ]);

  const tutors = Object.fromEntries(tutorGroups.map((g) => [g.status, g._count._all]));
  const tutorTotal = Object.values(tutors).reduce((a, b) => a + b, 0);

  const stats = [
    { label: 'Tutors', value: tutorTotal, href: '/admin/tutors', detail: `${tutors.ACTIVE || 0} active` },
    { label: 'Team members', value: team, href: '/admin/team' },
    { label: 'Activities', value: activities, href: '/admin/activities' },
    { label: 'Documents', value: documents, href: '/admin/documents' },
    { label: 'Albums', value: albums, href: '/admin/albums', detail: `${photos} photos` },
    { label: 'Videos', value: videos, href: '/admin/videos' },
    { label: 'Announcements', value: announcements, href: '/admin/announcements' },
    { label: 'Partners', value: partners, href: '/admin/partners' },
  ];

  res.render('admin/dashboard', {
    title: 'Dashboard',
    stats,
    tutorCounts: { pending: tutors.PENDING || 0, active: tutors.ACTIVE || 0, suspended: tutors.SUSPENDED || 0 },
    pending,
    recentAnnouncements,
    storageWarning: !isCloudinaryConfigured,
  });
}

module.exports = { dashboard };
