// Shared resource sections for admin publishing and the approved tutor portal.
module.exports = [
  { key: 'documents', value: 'DOCUMENTS', label: 'Documents', singular: 'document', icon: 'book',
    href: '/tutor/documents', adminHref: '/admin/documents', pageSlug: 'tutor-documents',
    summary: 'Curriculum materials, manuals, guidelines and teaching resources.',
    emptyText: 'No documents have been published here yet.' },
  { key: 'reports', value: 'REPORTS', label: 'Reports', singular: 'report', icon: 'page',
    href: '/tutor/reports', adminHref: '/admin/reports', pageSlug: 'tutor-reports',
    summary: 'Project, training and progress reports shared with tutors.',
    emptyText: 'No reports have been published here yet.' },
  { key: 'plans', value: 'PLANS_ACTIVITIES', label: 'Plans and Activities', singular: 'plan or activity', icon: 'growth',
    href: '/tutor/plans-and-activities', adminHref: '/admin/plans', pageSlug: 'tutor-plans-activities',
    summary: 'Work plans, schedules and information about project activities.',
    emptyText: 'No plans or activities have been published here yet.' },
];
