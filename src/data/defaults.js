// Starter records inserted by `npm run db:seed` when the tables are empty.
// After seeding, everything here is edited from the admin panel.
// (Default page text lives in src/config/pages.js.)

// Logos are static files in public/images/partners/ (no Cloudinary public ID, so replacing
// one in the admin panel uploads the new logo to Cloudinary and leaves these files alone).
const partners = [
  {
    name: 'Ministry of General Education and Instruction',
    shortName: 'MoGEI',
    url: null,
    logoUrl: '/images/partners/mogei.webp',
    isMain: true,
    displayOrder: 1,
  },
  {
    name: 'Kenyatta University',
    shortName: 'Kenyatta University',
    url: 'https://www.ku.ac.ke',
    logoUrl: '/images/partners/kenyatta-university.webp',
    isMain: false,
    displayOrder: 2,
  },
  {
    name: 'World Bank Group',
    shortName: 'World Bank Group',
    url: 'https://www.worldbank.org',
    logoUrl: '/images/partners/world-bank.webp',
    isMain: false,
    displayOrder: 3,
  },
];

// Activity descriptions drawn from the project Terms of Reference (Component 1).
const ACTIVITY_TEXT = {
  inService:
    'According to the 2021 Education Census Report, 46 percent of primary education teachers in South Sudan are volunteers without training. More than 30,000 volunteers teaching in South Sudanese schools need to be trained to offer quality education to the children already enrolled.\n\n' +
    'Component 1 of the project provides training to in-service teachers, particularly volunteer teachers, to improve their teaching practices. It also provides accelerated secondary education to existing uncertified teachers so they may become qualified to teach.\n\n' +
    "Teachers in refugee-hosting areas receive additional support for language training and socioemotional well-being. The project prioritises training for female teachers, who make up only about 18 percent of the country's 60,711 teachers.",
  cpd:
    'There is little in-service training or professional development on offer in South Sudan: teachers received only two days of training on content and pedagogies appropriate for the newly introduced competency-based curriculum.\n\n' +
    'Component 1 supports the development of a scalable and effective teacher professional development system that prepares new teachers to meet future needs and supports in-service teachers to improve their teaching practices.\n\n' +
    "Prioritising teacher professional development is critical to strengthening school systems and improving human capital accumulation. Effective teachers can significantly enhance students' long-term academic, socioemotional and professional achievements.",
};

// Slugs match the routes in the navigation (/activities/<slug>).
const activities = [
  {
    slug: 'in-service-training',
    title: 'In-Service Teacher Training',
    summary: 'Training for serving teachers, particularly volunteer teachers, to improve their teaching practices.',
    body: ACTIVITY_TEXT.inService,
    displayOrder: 1,
  },
  {
    slug: 'cpd',
    title: 'Continuous Professional Development',
    summary: 'Building a scalable teacher professional development system that supports teachers throughout their careers.',
    body: ACTIVITY_TEXT.cpd,
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

module.exports = { partners, activities, ACTIVITY_TEXT };
