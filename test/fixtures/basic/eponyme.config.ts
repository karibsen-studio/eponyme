import { collection, defineEponymeConfig, field, form } from '../../../src/eponyme'

export default defineEponymeConfig({
  pages: {
    homepage: {
      title: field.string({ required: true, defaultValue: 'Welcome' }),
      maxGuests: field.number({ min: 1, max: 20, defaultValue: 10 }),
      enabled: field.boolean({ defaultValue: true }),
      tags: field.array({ of: field.string({ required: true }), defaultValue: ['nuxt'] }),
      meta: field.section({
        label: 'Metadata',
        fields: {
          description: field.string({ defaultValue: 'Homepage description' }),
        },
      }),
    },
    frozen: {
      title: field.string({ required: true, defaultValue: 'Frozen' }),
    },
  },
  contact: form({
    label: 'Contact',
    fields: {
      name: field.string({ required: true, minLength: 2 }),
      email: field.email({ required: true }),
      phone: field.phone({ defaultCountry: 'FR', countries: ['FR', 'BE'] }),
      message: field.textarea({ required: true }),
    },
    submission: { mode: 'managed', maxStored: 100, retentionDays: 30 },
    maxBodyBytes: 512,
  }),
  limited: form({
    fields: { value: field.string({ required: true }) },
    submission: { mode: 'managed', maxStored: 2, retentionDays: false },
  }),
  // No `submission` key: this must default to `custom`, so it has no POST route.
  newsletter: form({
    fields: { email: field.email({ required: true }) },
  }),
  partnership: form({
    fields: {
      company: field.string({ required: true }),
      email: field.email({ required: true }),
    },
    submission: { mode: 'custom', store: true },
  }),
  // Its own form name, so its rate-limit window is its own: exhausting it cannot make
  // another test's submissions start failing.
  throttled: form({
    fields: { email: field.email({ required: true }) },
    submission: { mode: 'custom', store: false },
  }),
  // Publication turned off: the editor hides the tab and the API refuses its actions.
  releases: collection({
    label: 'Releases',
    titleField: 'title',
    slugField: 'slug',
    publication: false,
    fields: {
      title: field.string({ required: true }),
      slug: field.slug({ required: true }),
    },
  }),
  articles: collection({
    label: 'Articles',
    titleField: 'title',
    slugField: 'slug',
    fields: {
      title: field.string({ required: true }),
      slug: field.slug({ required: true }),
      excerpt: field.textarea(),
      // Present so the dashboard's server render exercises the lazily loaded rich text field.
      body: field.richText(),
      phone: field.phone({ defaultCountry: 'FR', countries: ['FR', 'BE'] }),
      tags: field.tags({ suggestions: ['Nuxt', 'Vue'], allowCustom: true, maxItems: 3 }),
    },
  }),
})
