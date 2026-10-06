// Search titles are independent of the visible headings and remain editable in the CMS.
const PUBLIC_PAGES = {
  '/': { slug: 'home', title: 'Teacher Training and Curriculum in South Sudan', description: 'Teacher training, curriculum development and digital learning to strengthen pre-service and in-service teacher education across South Sudan.' },
  '/about': { slug: 'about', title: 'About the South Sudan Teacher Training Project', type: 'AboutPage', description: "Learn how BSHCDSS supports South Sudan's Ministry of General Education and Instruction to strengthen teacher training and education delivery." },
  '/team': { slug: 'team', title: 'Project Team and Education Specialists', type: 'CollectionPage', description: 'Meet the BSHCDSS team of curriculum, teacher training, language pedagogy, EdTech and survey specialists, alongside project administration.' },
  '/curriculum': { slug: 'curriculum', title: 'Teacher Education Curriculum and Training Documents', type: 'CollectionPage', description: 'Access public teacher education curricula and training documents for pre-primary and primary education in South Sudan.' },
  '/gallery': { slug: 'gallery', title: 'Teacher Training Project Photos and Videos', type: 'CollectionPage', description: 'View photos and videos of teacher training workshops, digital learning activities and project engagement in South Sudan.' },
  '/contact': { slug: 'contact', title: 'Contact the Teacher Training and Development Project', type: 'ContactPage', description: 'Contact the Teacher Training and Development Project at the Ministry of General Education and Instruction in Juba, South Sudan.' },
  '/announcements': { slug: 'announcements', title: 'Project News and Announcements', type: 'CollectionPage', description: 'Read the latest public notices, project updates and announcements from the teacher training and curriculum development project in South Sudan.' },
};

const SEO_FIELDS = [
  {
    name: 'seoTitle', label: 'Search result title', type: 'text', max: 120, default: '',
    help: 'Use a concise, descriptive title. The project short name is added automatically. Leave blank to use the page heading.',
  },
  {
    name: 'seoDescription', label: 'Search result description', type: 'textarea', rows: 3, max: 300, default: '',
    help: 'Describe this page in one or two sentences, ideally around 150–160 characters. Leave blank to use its introduction.',
  },
];

module.exports = { PUBLIC_PAGES, SEO_FIELDS };
