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

module.exports = [
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
        default: ['Ministry of General Education and Instruction', 'Juba, Republic of South Sudan'],
      },
      { name: 'phone', label: 'Phone number', type: 'text', max: 40, default: '+211 000 000 000' },
      { name: 'email', label: 'Contact email', type: 'email', default: 'info@bshcdss.example' },
      { name: 'hours', label: 'Office hours', type: 'text', default: 'Monday to Friday, 8:00 am to 5:00 pm' },
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
          'BSHCDSS supports teachers, tutors and education institutions with a modern curriculum, structured training and lifelong professional development.',
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
      { name: 'introHeading', label: 'Introduction heading', type: 'text', default: 'About BSHCDSS' },
      {
        name: 'body',
        label: 'Introduction text',
        type: 'textarea',
        rows: 8,
        default:
          'Building Skills for Human Capacity Development in South Sudan (BSHCDSS) is a project of the Ministry of General Education and Instruction, implemented with Kenyatta University and supported by the World Bank Group.\n\n' +
          'The project focuses on strengthening the quality of teaching and learning by developing curriculum materials, training serving teachers and building systems for continuous professional growth.',
      },
      { name: 'objectivesHeading', label: 'Objectives box heading', type: 'text', default: 'Project objectives' },
      {
        name: 'objectives',
        label: 'Objectives',
        help: 'One objective per line.',
        type: 'lines',
        rows: 5,
        default: [
          'Design and develop relevant curriculum materials',
          'Train serving teachers through in-service programmes',
          'Establish continuous professional development pathways',
          'Expand access to learning through a digital platform',
        ],
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
        default: 'Building Skills for Human Capacity Development in South Sudan is a project of the Ministry of General Education and Instruction.',
      },
      { name: 'bodyHeading', label: 'Main text heading', type: 'text', max: 80, default: 'About the project' },
      {
        name: 'body',
        label: 'Main text',
        help: 'The first paragraph is shown larger, as an introduction. Separate paragraphs with a blank line.',
        type: 'textarea',
        rows: 12,
        default:
          'This is placeholder text for the About page. Replace it with the project background, goals and approach.\n\n' +
          'Separate paragraphs with a blank line.',
      },
      {
        name: 'imageCaption',
        label: 'Banner photo caption',
        help: 'Optional. Shown on the photo on larger screens, e.g. where and when it was taken.',
        type: 'text',
        max: 140,
        default: '',
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
    ],
  },
  {
    slug: 'curriculum',
    label: 'Curriculum Design and Development',
    description: 'The Curriculum page (/curriculum). The introduction also appears on the home page card.',
    fields: [
      { name: 'title', label: 'Page heading', type: 'text', required: true, default: 'Curriculum Design and Development' },
      {
        name: 'summary',
        label: 'Introduction',
        type: 'textarea',
        rows: 3,
        default: 'Developing curriculum frameworks and learning materials for teacher education.',
      },
      {
        name: 'body',
        label: 'Main text',
        type: 'textarea',
        rows: 12,
        default: 'This is placeholder text for the Curriculum Design and Development page.',
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
];
