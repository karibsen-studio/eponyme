import { defineBlock, field } from '../../../src/eponyme'

/**
 * The same call to action on the homepage and on the contact page: one definition, two
 * entries, each holding its own copy of the values.
 */
export const callToActionBlock = defineBlock({
  name: 'callToAction',
  label: 'Call to action',
  description: 'Heading and button shown at the end of the page.',
  fields: {
    heading: field.string({ label: 'Heading', maxLength: 80 }),
    body: field.textarea({ label: 'Body', maxLength: 240 }),
    label: field.string({ label: 'Button label', maxLength: 40 }),
    href: field.url({ label: 'Button link' }),
  },
})
