import { describe, expect, it } from 'vitest'
import { defineBlock } from '../src/config/block'
import { field } from '../src/runtime/fields'
import { schemaFingerprint } from '../src/runtime/server/services/eponyme-store'
import { createDefaultEponymeData } from '../src/runtime/utils/create-default-eponyme-data'
import { validateEponymeData } from '../src/runtime/utils/validate-eponyme-data'

const callToAction = defineBlock({
  name: 'callToAction',
  label: 'Call to action',
  description: 'Heading and button shown at the end of the page.',
  fields: {
    heading: field.string({ required: true, maxLength: 80 }),
    label: field.string({ defaultValue: 'Get in touch' }),
  },
})

/** What the block expands to, written by hand. Everything below compares against this. */
const inlineSection = field.section({
  label: 'Call to action',
  description: 'Heading and button shown at the end of the page.',
  fields: {
    heading: field.string({ required: true, maxLength: 80 }),
    label: field.string({ defaultValue: 'Get in touch' }),
  },
})

describe('defineBlock', () => {
  it('expands to the section it was written as', () => {
    const { block, ...definition } = callToAction()
    expect(definition).toEqual(inlineSection)
    expect(block).toEqual({ name: 'callToAction' })
  })

  it('lets a call site retitle a block and decide when it is shown', () => {
    const definition = callToAction({
      label: 'Article call to action',
      description: 'Shown under every article.',
      visibleWhen: { field: 'published', equals: true },
    })
    expect(definition.options.label).toBe('Article call to action')
    expect(definition.options.description).toBe('Shown under every article.')
    expect(definition.options.visibleWhen).toEqual({ field: 'published', equals: true })
    // The fields are the block's own: a call site retitles, it does not reshape.
    expect(definition.options.fields).toEqual(inlineSection.options.fields)
  })

  it('keeps the fingerprint of the section it expands to', () => {
    // The claim the whole design rests on: adopting a block, renaming one, or relabelling it
    // at a call site never invalidates an export made before.
    expect(schemaFingerprint({ cta: callToAction() })).toBe(schemaFingerprint({ cta: inlineSection }))
    expect(schemaFingerprint({ cta: callToAction({ label: 'Other' }) }))
      .toBe(schemaFingerprint({ cta: inlineSection }))

    const renamed = defineBlock({ name: 'somethingElse', label: 'Call to action', fields: callToAction().options.fields })
    expect(schemaFingerprint({ cta: renamed() })).toBe(schemaFingerprint({ cta: inlineSection }))
  })

  it('stores nothing of its own: the value is a plain section', () => {
    expect(createDefaultEponymeData({ cta: callToAction() }))
      .toEqual(createDefaultEponymeData({ cta: inlineSection }))
  })

  it('validates exactly like the section it expands to', () => {
    const data = { cta: { heading: '', label: 'Get in touch' } }
    expect(validateEponymeData({ cta: callToAction() }, data, 'publish'))
      .toEqual(validateEponymeData({ cta: inlineSection }, data, 'publish'))
    expect(validateEponymeData({ cta: callToAction() }, data, 'publish')['cta.heading']).toBeDefined()
  })

  it('goes inside a tab, which is a section too', () => {
    const schema = {
      content: field.tab({
        tabs: {
          hero: { label: 'Hero', fields: { title: field.string(), cta: callToAction() } },
        },
      }),
    }

    expect(createDefaultEponymeData(schema)).toEqual({
      content: { hero: { title: '', cta: { heading: '', label: 'Get in touch' } } },
    })

    // The rules of the block still apply four levels down.
    const errors = validateEponymeData(schema, { content: { hero: { title: '', cta: { heading: '', label: '' } } } }, 'publish')
    expect(errors['content.hero.cta.heading']).toBeDefined()
  })

  it('places two copies of the same block without them sharing anything', () => {
    const schema = { header: callToAction({ label: 'Header' }), footer: callToAction({ label: 'Footer' }) }
    const data = createDefaultEponymeData(schema) as Record<string, Record<string, unknown>>
    data.header!.heading = 'Only the header'
    expect(data.footer!.heading).toBe('')
  })
})
