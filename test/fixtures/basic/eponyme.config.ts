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
  },
  contact: form({
    label: 'Contact',
    fields: {
      name: field.string({ required: true, minLength: 2 }),
      email: field.email({ required: true }),
      message: field.textarea({ required: true }),
    },
    submission: { mode: 'managed' },
    maxBodyBytes: 512,
  }),
  // No `submission` key: this must default to `custom`, so it has no POST route.
  newsletter: form({
    fields: { email: field.email({ required: true }) },
  }),
  articles: collection({
    label: 'Articles',
    titleField: 'title',
    slugField: 'slug',
    fields: {
      title: field.string({ required: true }),
      slug: field.slug({ required: true }),
      excerpt: field.textarea(),
    },
  }),
})
