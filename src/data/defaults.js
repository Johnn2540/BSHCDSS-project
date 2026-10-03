// Starter records inserted by `npm run db:seed` when the tables are empty.
// After seeding, everything here is edited from the admin panel.
// (Default page text lives in src/config/pages.js.)

const partners = [
  { name: 'Ministry of General Education and Instruction', shortName: 'MoGEI', url: null, isMain: true, displayOrder: 1 },
  { name: 'Kenyatta University', shortName: 'Kenyatta University', url: 'https://www.ku.ac.ke', isMain: false, displayOrder: 2 },
  { name: 'World Bank Group', shortName: 'World Bank Group', url: 'https://www.worldbank.org', isMain: false, displayOrder: 3 },
];

// Slugs match the routes in the navigation (/activities/<slug>).
const activities = [
  {
    slug: 'in-service-training',
    title: 'In-Service Teacher Training',
    summary: 'Structured training that builds the skills of teachers already in the classroom.',
    body: 'This is placeholder text for the In-Service Teacher Training page.',
    displayOrder: 1,
  },
  {
    slug: 'cpd',
    title: 'Continuous Professional Development',
    summary: 'Ongoing learning opportunities that help educators keep growing in their careers.',
    body: 'This is placeholder text for the Continuous Professional Development page.',
    displayOrder: 2,
  },
  {
    slug: 'lms',
    title: 'Digital Learning Management System',
    summary: 'An online platform giving tutors and teachers access to courses and resources.',
    body: 'This is placeholder text for the Digital Learning Management System page. Add the link to the external LMS in the "External link" field.',
    externalUrl: null,
    displayOrder: 3,
  },
];

module.exports = { partners, activities };
