import { collection, defineEponymeConfig, field, form, today, toMs } from '../src/eponyme'
import { callToActionBlock } from './eponyme/blocks/call-to-action'

export default defineEponymeConfig({
  pages: {
    test: {
      Homepage: {
        content: field.tab({
          label: 'HomepagefhefehhehfvhefhzfehvjdjefjefjzfehjzhdefjejzfjejefjdzkfezfjzfjHomepagefhefehhehfvhefhzfehvjdjefjefjzfehjzhdefjejzfjejefjdzkfezfjzfjHomepagefhefehhehfvhefhzfehvjdjefjefjzfehjzhdefjejzfjejefjdzkfezfjzfj',
          description: 'Content, projects, SEO and display settings for the homepage.',
          tabs: {
            hero: {
              label: 'Hero',
              fields: {
                eyebrow: field.string({
                  label: 'Eyebrow',
                  placeholder: 'Hello',
                  defaultValue: 'A better way to create',
                  maxLength: 40,
                  showCounter: false,
                }),
                title: field.string({
                  label: 'Title',
                  defaultValue: 'Build something people remember',
                  minLength: 8,
                  maxLength: 80,
                  required: true,
                  validate: value => value.trim().split(/\s+/).length >= 3 || 'Use at least three words.',
                }),
                introduction: field.textarea({
                  label: 'Introduction',
                  defaultValue: 'Create, publish and update your content from a lightweight content manager designed for Nuxt.',
                  maxLength: 240,
                  placeholder: 'Describe what makes your project special…',
                }),
                image: field.image({
                  label: 'Image',
                  defaultValue: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
                  placeholder: 'https://example.com/hero.jpg',
                }),
                showreel: field.mediaPlayer({
                  label: 'Showreel',
                  description: 'YouTube, Vimeo ou un fichier vidéo servi directement. Le fournisseur est détecté depuis l’adresse.',
                  defaultValue: {
                    provider: 'youtube',
                    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    id: 'dQw4w9WgXcQ',
                  },
                }),
                callToActionLabel: field.string({
                  label: 'Call to action label',
                  defaultValue: 'Start a project',
                  maxLength: 30,
                }),
                callToActionUrl: field.url({
                  label: 'Call to action URL',
                  defaultValue: {
                    href: 'https://example.com/contact',
                    type: 'external',
                    openInNewTab: true,
                  },
                  placeholder: 'https://example.com/contact',
                  protocols: ['https'],
                }),
              },
            },
            projects: {
              label: 'Projects',
              fields: {
                visibleSections: field.checkboxGroup({
                  label: 'Visible sections',
                  options: [
                    { label: 'Highlights', value: 'highlights' },
                    { label: 'Projects', value: 'projects' },
                  ],
                  defaultValue: ['highlights', 'projects'],
                  minItems: 1,
                  required: true,
                }),
                items: field.array({
                  label: 'Projects',
                  description: 'Projects displayed in the selected work section.',
                  of: {
                    title: field.string({ label: 'Project title', required: true, maxLength: 80 }),
                    category: field.string({ label: 'Category', required: true, maxLength: 40 }),
                    description: field.textarea({ label: 'Description', required: true, maxLength: 160, minLength: 20 }),
                  },
                  defaultValue: [
                    { title: 'Atelier North', category: 'Brand identity', description: 'A tactile identity for an architecture studio rooted in natural materials.' },
                    { title: 'Maison Miro', category: 'Digital experience', description: 'An editorial storefront designed around craft, detail and slow living.' },
                    { title: 'Field Notes', category: 'Product design', description: 'A focused workspace that turns scattered research into clear decisions.' },
                    { title: 'Common Ground', category: 'Strategy', description: 'A new voice and visual direction for a community-led hospitality group.' },
                    { title: 'Studio Forma', category: 'Portfolio', description: 'A flexible showcase for objects, spaces and experiments in form.' },
                  ],
                  minItems: 1,
                  maxItems: 5,
                  addLabel: 'Add project',
                  itemLabel: '$title - $category',
                }),
                highlights: field.array({
                  label: 'Highlights',
                  description: 'Short benefits displayed in the homepage highlights list.',
                  of: field.string({ required: true, maxLength: 80 }),
                  defaultValue: ['Typed content', 'Built-in validation', 'Simple publishing'],
                  minItems: 1,
                  maxItems: 6,
                  addLabel: 'Add highlight',
                  showCounter: false,
                }),
                callToAction: callToActionBlock({ label: 'Projects call to action' }),
              },
            },
            seo: {
              label: 'SEO',
              fields: {
                slug: field.slug({ label: 'Slug', defaultValue: 'homepage', required: true }),
                title: field.string({ label: 'SEO title', defaultValue: 'Build something people remember', maxLength: 60 }),
                description: field.textarea({ label: 'SEO description', defaultValue: 'A reactive homepage powered by Eponyme.', maxLength: 160 }),
                socialTitle: field.string({ label: 'Share title', defaultValue: 'Build something people remember', maxLength: 70 }),
                socialImage: field.image({ label: 'Share image', defaultValue: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72' }),
              },
            },
            settings: {
              label: 'Settings',
              fields: {
                newsletterEmail: field.email({
                  label: 'Newsletter contact',
                  defaultValue: 'hello@example.com',
                }),
                contactPhone: field.phone({
                  label: 'Contact phone',
                  description: 'Stored in E.164. A French or Belgian number, typed in either format.',
                  defaultValue: '+33611131143',
                  defaultCountry: 'FR',
                  countries: ['FR', 'BE', 'PT'],
                  autocomplete: 'tel',
                  placeholder: '06 11 13 11 43',
                }),
                theme: field.radio({
                  label: 'Theme',
                  options: [
                    { label: 'Warm', value: 'warm' },
                    { label: 'Light', value: 'light' },
                    { label: 'Dark', value: 'dark' },
                  ],
                  defaultValue: 'warm',
                }),
                showLaunchDate: field.boolean({
                  label: 'Show launch date',
                  defaultValue: true,
                }),
                launchDate: field.date({
                  label: 'Launch date',
                  defaultValue: '2026-09-01',
                  min: '2026-01-01',
                  visibleWhen: { field: 'showLaunchDate', equals: true },
                }),
                launchDateTime: field.datetime({
                  label: 'Launch date and time',
                  description: 'Displayed in your local time zone and stored as UTC.',
                  defaultValue: '2026-09-01T08:30:00.000Z',
                  min: '2026-01-01T00:00:00.000Z',
                  visibleWhen: { field: 'showLaunchDate', equals: true },
                }),
                launchDuration: field.duration({
                  label: 'Launch duration',
                  description: 'Entered as hours, minutes, seconds and milliseconds; stored in milliseconds.',
                  defaultValue: '1h 10min',
                  min: '1min',
                  max: toMs('24h'),
                }),
                accentColor: field.color({
                  label: 'Accent color',
                  description: 'Uses the palette declared in nuxt.config.ts.',
                  defaultValue: '#171714',
                }),
                badgeColor: field.color({
                  label: 'Badge color',
                  description: 'Overrides the global palette with its own presets.',
                  presets: [
                    { label: 'Success', value: '#72d39a' },
                    { label: 'Warning', value: '#e6b85c' },
                    { label: 'Danger', value: '#ff8585' },
                  ],
                  defaultValue: '#72d39a',
                }),
                heroWidth: field.number({
                  label: 'Hero width',
                  description: 'Maximum width of the homepage hero in pixels.',
                  min: 640,
                  max: 1440,
                  step: 20,
                  slider: true,
                  suffix: 'px',
                  defaultValue: 960,
                }),
                heroPrice: field.number({
                  label: 'Hero price',
                  min: 0,
                  step: 0.5,
                  prefix: '€',
                  suffix: '/month',
                }),
                heroBudget: field.money({
                  label: 'Hero budget',
                  currency: 'USD',
                  min: 0,
                }),
                heroReference: field.masked({
                  label: 'Hero reference',
                  description: 'Preset built on field.string(). Stored the way it is displayed.',
                  mask: '@@-###-@@',
                  placeholder: 'AB-123-CD',
                }),
                published: field.boolean({
                  label: 'Published',
                  description: 'Make this homepage visible to visitors.',
                  defaultValue: true,
                }),
              },
            },
          },
        }),
      },
      contact: {
        title: field.string({ defaultValue: 'Contact' }),
        featuredArticle: field.relation({ label: 'Featured article', to: 'articles' }),
        callToAction: callToActionBlock(),
        seo: field.seo({ label: 'SEO (title and description only)', image: false, social: false }),
      },
    },
  },
  settings: {
    seo: {
      title: field.string(),
    },
  },
  contact: form({
    label: 'Contact',
    description: 'Messages sent from the public contact page.',
    fields: {
      name: field.string({ label: 'Name', required: true, minLength: 2, maxLength: 80 }),
      email: field.email({ label: 'Email', required: true }),
      phone: field.phone({
        label: 'Phone',
        description: 'Optional. Any format: it is stored in E.164.',
        defaultCountry: 'FR',
        autocomplete: 'tel',
        placeholder: '06 11 13 11 43',
      }),
      subject: field.select({
        label: 'Subject',
        required: true,
        options: [
          { label: 'A project', value: 'project' },
          { label: 'A question', value: 'question' },
          { label: 'Something else', value: 'other' },
        ],
      }),
      message: field.textarea({ label: 'Message', required: true, minLength: 10, maxLength: 2000 }),
      newsletter: field.boolean({ label: 'Subscribe to the newsletter' }),
    },
    submission: { mode: 'managed' },
  }),
  articles: collection({
    label: 'Articles',
    description: 'Create and publish articles displayed on the public playground.',
    addLabel: 'Écrire un article',
    titleField: 'title',
    slugField: 'slug',
    fields: {
      title: field.string({ label: 'Title', required: true, maxLength: 100 }),
      slug: field.slug({ label: 'Slug', required: true, maxLength: 120 }),
      excerpt: field.textarea({ label: 'Excerpt', required: true, maxLength: 220 }),
      callToAction: callToActionBlock({ label: 'Article call to action' }),
      related: field.relation({
        label: 'Related articles',
        description: 'Up to three other articles, picked from this collection.',
        to: 'articles',
        multiple: true,
        maxItems: 3,
      }),
      category: field.select({
        label: 'Category',
        placeholder: 'Select a category',
        options: [
          { label: 'Business', value: 'business' },
          { label: 'Design', value: 'design' },
          { label: 'Engineering', value: 'engineering' },
          { label: 'Guides', value: 'guides' },
          { label: 'News', value: 'news' },
          { label: 'Product', value: 'product' },
        ],
      }),
      cover: field.image({ label: 'Cover image' }),
      brochure: field.file({
        label: 'Brochure',
        description: 'Uploaded to the configured storage, or an address when there is none.',
        accept: ['application/pdf'],
      }),
      video: field.mediaPlayer({
        label: 'Video',
        description: 'Vimeo ou un fichier vidéo. YouTube n’est pas accepté ici.',
        providers: ['vimeo', 'url'],
        placeholder: 'https://vimeo.com/76979871',
      }),
      body: field.richText({
        label: 'Article body',
        description: 'Format the article with headings, lists, quotes and links.',
        required: true,
        placeholder: 'Write your article…',
      }),
      seo: field.seo({
        description: 'Preset built on field.section(), the way field.money() is built on field.number().',
        siteName: 'Eponyme Playground',
        themeColor: '#171714',
      }),
      publishedOn: field.date({ label: 'Publication date', defaultValue: today() }),
      tags: field.tags({
        label: 'Tags',
        description: 'Suggestions, saisie libre, doublons de casse repliés.',
        suggestions: ['Nuxt', 'Vue', 'TypeScript', 'Prisma'],
        allowCustom: false,
        maxItems: 4,
        defaultValue: ['Nuxt'],
        placeholder: 'Ajouter un tag…',
      }),
    },
  }),
  movies: collection({
    label: 'Movies',
    description: 'Movies reviewed in the playground with a custom rating field.',
    addLabel: 'Add a movie',
    titleField: 'title',
    slugField: 'slug',
    fields: {
      title: field.string({ label: 'Title', required: true, maxLength: 120 }),
      slug: field.slug({ label: 'Slug', required: true, maxLength: 140 }),
      description: field.textarea({ label: 'Description', required: true, maxLength: 500 }),
      image: field.image({ label: 'Poster', required: true, sources: ['relative', 'absolute'] }),
      rating: field.custom('rating', {
        label: 'Rating',
        description: 'Score from one to five stars.',
        required: true,
        min: 1,
        max: 5,
        defaultValue: 3,
      }),
    },
  }),
  breadcrumb_examples: {
    level_01_first_folder: {
      level_02_folder_with_an_intentionally_very_long_name: {
        level_03_projects: {
          level_04_website: {
            level_05_content: {
              level_06_marketing: {
                level_07_campaigns: {
                  level_08_summer_campaign: {
                    level_09_landing_pages: {
                      level_10_final_folder: {
                        page_with_an_extremely_long_title_to_demonstrate_middle_ellipsis: {
                          title: field.string({
                            label: 'Example content',
                            defaultValue: 'This entry demonstrates ten deeply nested folders.',
                          }),
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
})
