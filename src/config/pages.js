// Editable page content. Each page is one PageContent row, looked up by slug.
// Fields named `title`, `summary` and `body` are stored in those columns; every other
// field is stored in the `sections` JSON column.
//
// Field types:
//   text      single line
//   textarea  multi-line; blank lines separate paragraphs on the website
//   lines     one item per line, stored as an array (lists, address lines)
//   email / url
//   image     uploaded photo, stored as { url, publicId, width, height } (null = use the built-in default)
//
// `default` is shown until an admin saves the page for the first time.

const tutorSections = require('./tutorSections');
const { whatsappUrlFor } = require('../services/team');
const { PUBLIC_PAGES, SEO_FIELDS } = require('./seo');

const pageConfigs = [
  {
    slug: 'announcements',
    label: 'Public announcements page',
    description: 'Introduction to the public notices opened from the notification bell. Notices are managed in Announcements.',
    fields: [
      { name: 'title', label: 'Page heading', type: 'text', required: true, max: 150, default: 'News and announcements' },
      { name: 'summary', label: 'Introduction', type: 'textarea', rows: 3, max: 500, default: 'The latest public notices and updates from the project.' },
    ],
  },
  {
    slug: 'site',
    label: 'Site settings and contact details',
    description: 'Project name and contact details shown in the header and footer of every page.',
    fields: [
      { name: 'title', label: 'Short name', type: 'text', required: true, max: 40, default: 'BSHCDSS' },
      {
        name: 'fullName',
        label: 'Full project name',
        type: 'text',
        required: true,
        default: 'Building Skills for Human Capacity Development in South Sudan',
      },
      { name: 'ministry', label: 'Ministry', type: 'text', required: true, default: 'Ministry of General Education and Instruction' },
      { name: 'country', label: 'Country', type: 'text', required: true, default: 'Republic of South Sudan' },
      {
        name: 'summary',
        label: 'Site description',
        help: 'Used by search engines and link previews. One or two sentences.',
        type: 'textarea',
        rows: 3,
        max: 300,
        default:
          'Strengthening teacher education and curriculum delivery across South Sudan through training, professional development and digital learning.',
      },
      {
        name: 'address',
        label: 'Postal address',
        help: 'One line per row.',
        type: 'lines',
        rows: 3,
        default: [
          'Teacher Training and Development Project',
          'Ministry of General Education and Instruction',
          'Juba, Republic of South Sudan',
        ],
      },
      { name: 'addressLocality', label: 'Office city', type: 'text', max: 100, default: 'Juba', help: 'City used in the structured address for search engines.' },
      {
        name: 'addressCountryCode', label: 'Office country code', type: 'text', max: 2, default: 'SS',
        help: 'Two-letter ISO country code for the office address. South Sudan is SS.',
        validate: value => {
          if (!/^[A-Za-z]{2}$/.test(value)) throw new Error('Use a two-letter country code, such as SS.');
          return true;
        },
      },
      { name: 'phone', label: 'Primary phone number', type: 'text', max: 40, default: '0726540368', help: 'Include + and the country code to also use this number in search engine structured data.' },
      { name: 'secondaryPhone', label: 'Alternative phone number', type: 'text', max: 40, default: '0725745166' },
      { name: 'email', label: 'Contact email', type: 'email', default: 'kussdproject@gmail.com' },
      { name: 'hours', label: 'Office hours', type: 'text', default: 'Monday to Friday, 8:00 am to 5:00 pm' },
      {
        name: 'partnerButtonLabel', label: 'Partnership button label', type: 'text', max: 60, default: 'Become a partner',
        help: 'Shown on Home, About and beside the footer partner logos. Opens the contact form for a partnership enquiry. Clear to hide the buttons.',
      },
      {
        name: 'googleSiteVerification', label: 'Google Search Console verification code', type: 'text', max: 200, default: '',
        help: 'Optional. Paste only the content value from the Google HTML verification tag. Domain verification through DNS also works.',
        validate: value => {
          if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Paste the verification code only, without the HTML tag.');
          return true;
        },
      },
    ],
  },
  {
    slug: 'home',
    label: 'Home page',
    description: 'The banner, introduction and call-out boxes on the home page. Activity cards come from the Activities section.',
    fields: [
      { name: 'eyebrow', label: 'Banner label', type: 'text', default: 'A project of the Ministry of General Education and Instruction' },
      { name: 'title', label: 'Banner heading', type: 'text', required: true, default: 'Building Skills for Human Capacity Development in South Sudan' },
      {
        name: 'summary',
        label: 'Banner text',
        type: 'textarea',
        rows: 3,
        default:
          "Strengthening pre-service and in-service teacher training in South Sudan through a comprehensive teacher training package for the country's National Teacher Training Institutions.",
      },
      {
        name: 'heroImage',
        label: 'Banner photo',
        type: 'image',
        folder: 'pages',
        help: 'A photo of the project at work, at least 1200 pixels wide (portrait or square works best). If empty, the workshop photo is used.',
        default: null,
      },
      {
        name: 'heroImageAlt',
        label: 'Banner photo description',
        help: 'Describe the photo in a sentence for people who cannot see it. Update this when you change the photo.',
        type: 'text',
        max: 200,
        default: 'Participants working together at laptops around tables during a workshop',
      },
      { name: 'primaryCtaLabel', label: 'First button label (links to About)', type: 'text', max: 40, default: 'About the project' },
      { name: 'secondaryCtaLabel', label: 'Second button label (links to Project Activities)', type: 'text', max: 40, default: 'Project activities' },
      { name: 'introHeading', label: 'Introduction heading', type: 'text', default: 'About the project' },
      {
        name: 'body',
        label: 'Introduction text',
        help: 'The first paragraph is shown larger. Separate paragraphs with a blank line.',
        type: 'textarea',
        rows: 8,
        default:
          'The Government of South Sudan, through the Ministry of Finance and Planning in collaboration with the Ministry of General Education and Instruction and the Ministry of Higher Education, Science and Technology, is implementing a five-year, World Bank-funded project: Building Skills for Human Capital Development in South Sudan.\n\n' +
          'BSHCDSS supports Component 1 of the project, Teaching Skills to Strengthen Education Delivery, by developing a comprehensive teacher training package to strengthen pre-service and in-service teacher training at 10 National Teacher Training Institutions (NTTIs).',
      },
      {
        name: 'introImage',
        label: 'About the project photo',
        type: 'image',
        folder: 'pages',
        help: 'Shown as a wide banner under the About the project text. A landscape photo at least 1400 pixels wide with the main subjects near the middle; it is cropped to a wide strip on large screens. If empty, the built-in training-room photo is used.',
        default: null,
      },
      {
        name: 'introImageAlt',
        label: 'About the project photo description',
        help: 'Describe the photo in a sentence for people who cannot see it. Update this when you change the photo.',
        type: 'text',
        max: 200,
        default: 'Participants working at laptops and tables during a training session in a large hall',
      },
      { name: 'objectivesHeading', label: 'Objectives box heading', type: 'text', default: 'What Component 1 will do' },
      {
        name: 'objectives',
        label: 'Objectives',
        help: 'One objective per line.',
        type: 'lines',
        rows: 6,
        default: [
          'Prepare new teachers to meet future needs through formal pre-service teacher training',
          'Train in-service teachers, particularly volunteer teachers, to improve their teaching practices',
          'Provide accelerated secondary education so that existing teachers can become qualified',
          'Support teachers in refugee-hosting areas with language training and socioemotional well-being',
          'Prioritise training for female teachers',
        ],
      },
      { name: 'statsHeading', label: 'Statistics section heading', type: 'text', max: 80, default: 'Why teacher training matters' },
      {
        name: 'statsLead',
        label: 'Statistics section introduction',
        type: 'textarea',
        rows: 2,
        max: 300,
        default:
          'The lack of qualified teachers is one of the biggest barriers to quality education in South Sudan. More than 30,000 volunteer teachers need training.',
      },
      {
        name: 'stats',
        label: 'Statistics',
        help: 'One per line, written as: figure | what it means. Example: 86:1 | pupils per qualified teacher in primary schools. Leave empty to hide the section.',
        type: 'lines',
        rows: 5,
        default: [
          '60,711 | teachers in South Sudan, of whom only about 18% are female',
          '86:1 | pupils per qualified teacher in primary schools',
          '46% | of primary teachers are volunteers without training',
          '26% | of schools are non-operational due to a lack of teachers',
        ],
      },
      {
        name: 'statsSource',
        label: 'Statistics source',
        type: 'text',
        max: 200,
        default: 'Source: 2021 Education Census Report, as cited in the project Terms of Reference.',
      },
      {
        name: 'statsImage',
        label: 'Statistics section photo',
        type: 'image',
        folder: 'pages',
        help: 'Shown beside the statistics. A landscape or portrait classroom photo at least 1000 pixels wide; it is cropped to fit. If empty, the built-in classroom photo is used.',
        default: null,
      },
      {
        name: 'statsImageAlt',
        label: 'Statistics section photo description',
        help: 'Describe the photo in a sentence for people who cannot see it. Update this when you change the photo.',
        type: 'text',
        max: 200,
        default: 'A teacher using a blackboard to teach mathematics to a crowded classroom of children',
      },
      { name: 'focusHeading', label: 'Activities section heading', type: 'text', default: 'What the project does' },
      { name: 'focusLead', label: 'Activities section introduction', type: 'text', default: "The project's main areas of work, from curriculum design to digital learning." },
      { name: 'newsHeading', label: 'News section heading', type: 'text', max: 80, default: 'News and announcements', help: 'Shown when there are published public announcements.' },
      { name: 'galleryHeading', label: 'Gallery section heading', type: 'text', default: 'Project in Pictures and Videos' },
      {
        name: 'galleryLead',
        label: 'Gallery section text',
        type: 'textarea',
        rows: 2,
        default: 'See the project at work through photographs and videos from training sessions, workshops and events.',
      },
      { name: 'contactHeading', label: 'Closing section heading', type: 'text', default: 'Get in touch' },
      { name: 'contactLead', label: 'Closing section text', type: 'textarea', rows: 2, default: 'For enquiries about the project, please contact the BSHCDSS team.' },
    ],
  },
  {
    slug: 'about',
    label: 'About BSHCDSS',
    description: 'The About page (/about).',
    fields: [
      { name: 'title', label: 'Page heading', type: 'text', required: true, default: 'About BSHCDSS' },
      {
        name: 'summary',
        label: 'Introduction',
        type: 'textarea',
        rows: 3,
        default:
          'Supporting the Ministry of General Education and Instruction to strengthen pre-service and in-service teacher training in South Sudan.',
      },
      { name: 'bodyHeading', label: 'Main text heading', type: 'text', max: 80, default: 'About the project' },
      {
        name: 'body',
        label: 'Main text',
        help: 'The first paragraph is shown larger, as an introduction. Separate paragraphs with a blank line.',
        type: 'textarea',
        rows: 14,
        default:
          'The Government of South Sudan, through the Ministry of Finance and Planning in collaboration with the Ministry of General Education and Instruction (MoGEI) and the Ministry of Higher Education, Science and Technology (MoHEST), is implementing a five-year, World Bank-funded project: Building Skills for Human Capital Development in South Sudan.\n\n' +
          "The project's development objective is to increase skills development opportunities in teaching and digital agriculture and to strengthen capacity for management of the education system. It was approved by the World Bank Board of Directors on 15 May 2023.\n\n" +
          'BSHCDSS supports Component 1, Teaching Skills to Strengthen Education Delivery. This component supports the development of a scalable and effective teacher professional development system that prepares new teachers to meet future needs, supports in-service teachers to improve their teaching practices, and provides accelerated secondary education to existing uncertified teachers so they may become qualified to teach. Teachers in refugee-hosting areas receive additional support for language training and socioemotional well-being, and the project prioritises training for female teachers.\n\n' +
          'The technical assistance develops a comprehensive teacher training package to strengthen pre-service and in-service teacher training. It runs for 24 months across 10 National Teacher Training Institutions (NTTIs) and reports to the Project Director of the Project Implementation Unit (PIU) at the Ministry of General Education and Instruction.\n\n' +
          'The need is urgent. As of March 2023, only 3 public National Teacher Training Institutions, 3 private teacher training institutions and 6 County Education Centers were in operation, while more than 30,000 volunteers teaching in South Sudanese schools need to be trained.',
      },
      {
        name: 'facts',
        label: 'At a glance: key facts',
        help: 'One per line, written as: label | value. Shown in the "At a glance" panel.',
        type: 'lines',
        rows: 6,
        default: [
          'Project | Building Skills for Human Capital Development in South Sudan',
          'World Bank project number | P178654',
          'Approved | 15 May 2023',
          'Project duration | Five years',
          'Technical assistance | 24 months, across 10 National Teacher Training Institutions',
          'Reports to | Project Director, Project Implementation Unit (PIU), MoGEI',
        ],
      },
      { name: 'componentsHeading', label: 'Project components heading', type: 'text', max: 80, default: 'The five project components' },
      {
        name: 'components',
        label: 'Project components',
        help: 'One per line, written as: name | description. The first one is highlighted as the focus of BSHCDSS. Leave empty to hide the section.',
        type: 'lines',
        rows: 6,
        default: [
          'Teaching skills to strengthen education delivery | A scalable and effective teacher professional development system: preparing new teachers, supporting in-service teachers and providing accelerated secondary education to uncertified teachers.',
          'Digital skills for agriculture | A digital agriculture skills programme offered through existing higher education institutions across the country.',
          'Inclusion of refugee and host communities | Re-operationalising 200 schools in refugee-hosting areas to offer quality education to both refugee and host community students.',
          'System building | Support for basic functionality to monitor and manage the education system of the country.',
          'Contingent emergency response | A zero-allocation component to finance an emergency response if needed.',
        ],
      },
      {
        name: 'imageCaption',
        label: 'Banner photo caption',
        help: 'Optional. Shown on the photo on larger screens, e.g. where and when it was taken.',
        type: 'text',
        max: 140,
        default: '',
      },
      {
        name: 'galleryHeading',
        label: 'Photo slideshow heading',
        help: 'Heading above the slideshow of training photos. Clear it to hide the slideshow.',
        type: 'text',
        max: 80,
        default: 'The training in pictures',
      },
      {
        name: 'galleryLead',
        label: 'Photo slideshow introduction',
        type: 'text',
        max: 200,
        default: 'Participants and facilitators at project training workshops.',
      },
      { name: 'workHeading', label: 'Areas of work heading', type: 'text', max: 80, default: 'What the project does' },
      { name: 'workLead', label: 'Areas of work introduction', type: 'text', max: 200, default: "The project's main areas of work." },
      { name: 'ctaHeading', label: 'Closing section heading', type: 'text', max: 80, default: 'Find out more' },
      {
        name: 'ctaText',
        label: 'Closing section text',
        type: 'textarea',
        rows: 2,
        max: 300,
        default: 'Meet the people behind the project, or get in touch with the team.',
      },
    ],
  },
  {
    slug: 'team',
    label: 'Project Team',
    description: 'Heading and introduction on the Project Team page (/team). Team members are managed in the Team section.',
    fields: [
      { name: 'title', label: 'Page heading', type: 'text', required: true, default: 'Project Team' },
      { name: 'summary', label: 'Introduction', type: 'textarea', rows: 3, default: 'The people leading and delivering the BSHCDSS project.' },
      { name: 'teamHeading', label: 'Key personnel heading', type: 'text', default: 'Project specialists' },
      { name: 'teamIntro', label: 'Key personnel introduction', type: 'textarea', rows: 3, default: 'Expertise in curriculum development, teacher training, language pedagogy, educational technology and surveys.' },
      { name: 'supportHeading', label: 'Support team heading', type: 'text', default: 'Project administration and support' },
      { name: 'emptyText', label: 'Empty team message', type: 'text', default: 'Team profiles will be published here soon.' },
      { name: 'contactHeading', label: 'Contact section heading', type: 'text', default: 'Connect with the project' },
      { name: 'contactText', label: 'Contact section introduction', type: 'textarea', rows: 2, default: 'For project enquiries, partnerships or further information, get in touch with our team.' },
      { name: 'contactButtonLabel', label: 'Contact button label', type: 'text', default: 'Contact the project' },
      {
        name: 'moreNote',
        label: 'Note below the team',
        help: 'Shown under the team members. Clear it once the team list is complete.',
        type: 'text',
        max: 200,
        default: '',
      },
    ],
  },
  {
    slug: 'curriculum',
    label: 'Curriculum Design and Development',
    description: 'The Curriculum page (/curriculum), including the document library and tutor resource introduction. The introduction also appears on the home page card.',
    fields: [
      { name: 'title', label: 'Page heading', type: 'text', required: true, default: 'Curriculum Design and Development' },
      {
        name: 'summary',
        label: 'Introduction',
        type: 'textarea',
        rows: 3,
        default: 'Curriculum designs and practical training resources supporting pre-service and in-service teacher education in South Sudan.',
      },
      {
        name: 'body',
        label: 'Main text',
        type: 'textarea',
        rows: 12,
        default:
          'The teacher education curriculum supports certificate and diploma programmes for pre-primary and primary education. The subject designs bring together learning outcomes, teaching activities and guidance for preparing student teachers for classroom practice.\n\n' +
          'The Master Trainers manual supports the implementation of competency-based education through facilitation, lesson planning, assessment, live teaching and reflective practice. Together, these resources form part of the comprehensive package for strengthening pre-service and in-service teacher education in South Sudan.',
      },
      { name: 'eyebrow', label: 'Banner label', type: 'text', default: 'Teacher education resources' },
      { name: 'browseLabel', label: 'Browse button label', type: 'text', default: 'Browse the document library' },
      { name: 'libraryHeading', label: 'Document library heading', type: 'text', default: 'Curriculum document library' },
      {
        name: 'libraryIntro', label: 'Document library introduction', type: 'textarea', rows: 3,
        default: 'Find subject curriculum designs and training materials. Search by keyword or browse a subject area, then download the original Word document.',
      },
      { name: 'libraryEmpty', label: 'Empty library message', type: 'text', default: 'Curriculum documents will be published here soon.' },
      { name: 'overviewEyebrow', label: 'Overview label', type: 'text', default: 'About the curriculum' },
      { name: 'overviewHeading', label: 'Overview heading', type: 'text', default: 'A shared foundation for teacher education' },
      { name: 'tutorHeading', label: 'Tutor information heading', type: 'text', default: 'Resources for registered tutors' },
      {
        name: 'tutorIntro', label: 'Tutor information text', type: 'textarea', rows: 3,
        default: 'Sign in to your tutor area to access public curriculum documents and any additional materials shared with tutors.',
      },
      {
        name: 'cardImage',
        label: 'Card image',
        type: 'image',
        folder: 'pages',
        help: 'Shown on the home page card and at the top of the Curriculum page. Use a landscape photo at least 1200 pixels wide; it is cropped to 16:9. If empty, a built-in workshop photo is used.',
        default: null,
      },
    ],
  },
  {
    slug: 'gallery',
    label: 'Project in Pictures and Videos',
    description: 'Heading and introduction on the gallery page (/gallery). Albums and videos are managed separately.',
    fields: [
      { name: 'title', label: 'Page heading', type: 'text', required: true, default: 'Project in Pictures and Videos' },
      {
        name: 'summary',
        label: 'Introduction',
        type: 'textarea',
        rows: 3,
        default: 'Photographs and videos from training sessions, workshops and project events.',
      },
    ],
  },
  {
    slug: 'contact',
    label: 'Contact',
    description: 'Heading and introduction on the Contact page (/contact). Address and phone come from Site settings.',
    fields: [
      {
        name: 'partnershipSubject', label: 'Partnership enquiry subject', type: 'text', max: 150, default: 'Partnership enquiry',
        help: 'Prefilled in the contact form when visitors select Become a partner. Visitors can edit it before sending.',
      },
      { name: 'title', label: 'Page heading', type: 'text', required: true, default: 'Contact us' },
      {
        name: 'summary',
        label: 'Introduction',
        type: 'textarea',
        rows: 3,
        default: 'For enquiries about the BSHCDSS project, please get in touch using the details below or the contact form.',
      },
      { name: 'formHeading', label: 'Form heading', type: 'text', max: 80, default: 'Send us a message' },
      {
        name: 'formIntro',
        label: 'Form introduction',
        help: 'Shown beside the contact form.',
        type: 'textarea',
        rows: 3,
        max: 500,
        default:
          'Use this form for enquiries about teacher training, curriculum documents, partnerships or media requests. A member of the project team will reply by email.',
      },
    ],
  },
  {
    slug: 'tutor-request',
    label: 'Request tutor access',
    description: 'The page where visitors ask for a tutor account (/request-tutor-access). Requests are reviewed in Admin > Tutor requests.',
    fields: [
      { name: 'title', label: 'Page heading', type: 'text', required: true, max: 100, default: 'Request tutor access' },
      {
        name: 'summary',
        label: 'Introduction',
        type: 'textarea',
        rows: 3,
        max: 500,
        default: 'Registered tutors can download training documents, reports and plans from the Tutor Portal. Tell us about yourself and the project administrator will review your request.',
      },
      { name: 'stepsHeading', label: 'Steps heading', type: 'text', max: 80, default: 'What happens next' },
      {
        name: 'steps',
        label: 'Steps',
        help: 'One step per line, in order.',
        type: 'lines',
        rows: 4,
        default: [
          'Send your details using the form.',
          'The project administrator reviews your request.',
          'If it is approved, you receive an email with a link to choose your password. You can then log in to the Tutor Portal.',
        ],
      },
      { name: 'formHeading', label: 'Form heading', type: 'text', max: 80, default: 'Your details' },
      {
        name: 'directWhatsapp', label: 'Other ways to ask: WhatsApp number', type: 'text', max: 40, default: '+254715330094',
        help: 'Full international number including + and the country code. Leave blank to hide the WhatsApp button.',
        validate: value => {
          if (!whatsappUrlFor(value)) throw new Error('Enter a full international WhatsApp number, such as +254 715 330094.');
          return true;
        },
      },
      { name: 'directEmail', label: 'Other ways to ask: email address', type: 'email', default: 'ndongoli.cestine@ku.ac.ke', help: 'Leave blank to hide the email button.' },
      { name: 'directHeading', label: 'Other ways to ask: heading', type: 'text', max: 80, default: 'Prefer to ask directly?' },
      {
        name: 'directText',
        label: 'Other ways to ask: text',
        type: 'textarea',
        rows: 2,
        max: 300,
        default: 'You can also message the project team on WhatsApp or by email. Please send only one request: repeated requests are ignored.',
      },
      { name: 'alreadyHeading', label: 'Already sent: heading', type: 'text', max: 100, default: 'You have already sent a request' },
      {
        name: 'alreadyText',
        label: 'Already sent: text',
        type: 'textarea',
        rows: 3,
        max: 500,
        default: 'To protect the project team from repeated messages, each person can send one request. The administrator will review yours. If you need to follow it up, contact the team directly.',
      },
      {
        name: 'privacyNote',
        label: 'Privacy note beside the form',
        type: 'textarea',
        rows: 3,
        max: 400,
        default: 'We use these details only to review your request and, if it is approved, to create your tutor account and email you a link to choose a password. We never share them.',
      },
      { name: 'successHeading', label: 'Confirmation heading', type: 'text', max: 100, default: 'Request received' },
      {
        name: 'successText',
        label: 'Confirmation text',
        type: 'textarea',
        rows: 3,
        max: 500,
        default: 'Thank you. The project administrator will review your request. If it is approved, you will receive an email with a link to choose your password.',
      },
    ],
  },
  {
    slug: 'tutor-portal', label: 'Tutor Portal',
    description: 'Welcome, introduction and help text for approved tutors (/tutor).',
    fields: [
      { name: 'title', label: 'Portal heading', type: 'text', required: true, default: 'Tutor Portal' },
      { name: 'summary', label: 'Introduction', type: 'textarea', rows: 3, default: 'Access documents, reports, plans and activities shared by the project team.' },
      { name: 'helpHeading', label: 'Help heading', type: 'text', default: 'Need help with your resources?' },
      { name: 'helpText', label: 'Help text', type: 'textarea', rows: 3, default: 'Contact the project team if you need a resource, have trouble downloading a file or need help with your account.' },
    ],
  },
  ...tutorSections.map((section) => ({
    slug: section.pageSlug, label: `Tutor Portal: ${section.label}`,
    description: `Heading, introduction and empty-state text at ${section.href}. Files are managed in ${section.adminHref}.`,
    fields: [
      { name: 'title', label: 'Section heading', type: 'text', required: true, default: section.label },
      { name: 'summary', label: 'Introduction', type: 'textarea', rows: 3, default: section.summary },
      { name: 'libraryEmpty', label: 'Empty section message', type: 'text', default: section.emptyText },
    ],
  })),
];

const searchDefaults = Object.fromEntries(Object.values(PUBLIC_PAGES).map(page => [page.slug, page]));
module.exports = pageConfigs.map(config => searchDefaults[config.slug] ? {
  ...config,
  fields: [...config.fields, ...SEO_FIELDS.map(field => ({
    ...field, default: field.name === 'seoTitle' ? searchDefaults[config.slug].title : searchDefaults[config.slug].description,
  }))],
} : config);
