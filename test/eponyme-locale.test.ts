import { describe, expect, it } from 'vitest'
import { renderEponymeLocaleModule, resolveEponymeLocale } from '../src/locale-build'
import { eponymeEnglishMessages } from '../src/runtime/locales'
import { createEponymeTranslator, defaultEponymePlural } from '../src/runtime/utils/translate'

describe('translator', () => {
  const t = createEponymeTranslator({
    plain: 'Add item',
    interpolated: 'Must contain at least {min} characters.',
    twice: '{count} / {max}',
    plural: 'no items | one item | {count} items',
  })

  it('returns the message', () => {
    expect(t('plain')).toBe('Add item')
  })

  it('shows the key when neither the locale nor English defines it', () => {
    expect(t('nope')).toBe('nope')
  })

  it('interpolates named placeholders, and leaves unknown ones alone', () => {
    expect(t('interpolated', { min: 12 })).toBe('Must contain at least 12 characters.')
    expect(t('twice', { count: 2, max: 5 })).toBe('2 / 5')
    expect(t('interpolated')).toBe('Must contain at least {min} characters.')
  })

  it('selects a plural form from the count', () => {
    expect(t('plural', { count: 0 })).toBe('no items')
    expect(t('plural', { count: 1 })).toBe('one item')
    expect(t('plural', { count: 7 })).toBe('7 items')
  })

  it('falls back to the general form when there is no count to select on', () => {
    expect(t('plural')).toBe('{count} items')
  })

  it('clamps an index the message has no form for, rather than returning undefined', () => {
    const twoForms = createEponymeTranslator({ pair: 'one | many' }, () => 5)
    expect(twoForms('pair', { count: 3 })).toBe('many')
  })

  it('uses the locale rule when one is given', () => {
    // Russian-shaped: 1 takes the singular, 2-4 a second form, the rest a third.
    const ru = createEponymeTranslator({ n: 'один | несколько | много' }, count => (count === 1 ? 0 : count < 5 ? 1 : 2))
    expect([ru('n', { count: 1 }), ru('n', { count: 3 }), ru('n', { count: 9 })])
      .toEqual(['один', 'несколько', 'много'])
  })

  it('treats nought and one as their own forms by default', () => {
    expect([0, 1, 2, 99].map(defaultEponymePlural)).toEqual([0, 1, 2, 2])
  })
})

describe('build-time resolution', () => {
  it('falls back to English when no locale is configured', () => {
    const resolved = resolveEponymeLocale(undefined)
    expect(resolved.code).toBe('en-GB')
    expect(resolved.missing).toEqual([])
    expect(resolved.messages['field.required']).toBe('This field is required.')
  })

  it('merges English underneath and reports what the catalogue lacks', () => {
    const resolved = resolveEponymeLocale({
      code: 'fr-FR',
      messages: { 'field.required': 'Ce champ est obligatoire.' },
    })

    expect(resolved.messages['field.required']).toBe('Ce champ est obligatoire.')
    // Untranslated keys read in English rather than showing their own name.
    expect(resolved.messages['field.object']).toBe('Must be an object.')
    expect(resolved.missing).toContain('field.object')
    expect(resolved.missing).not.toContain('field.required')
    expect(resolved.missing).toHaveLength(Object.keys(eponymeEnglishMessages).length - 1)
  })

  it('names the mistake when the option is the factory instead of its result', () => {
    expect(() => resolveEponymeLocale(() => ({}))).toThrow(/expects the result of a call/)
    expect(() => resolveEponymeLocale(() => ({}))).toThrow(TypeError)
  })

  it('refuses anything that is not a locale definition', () => {
    expect(() => resolveEponymeLocale('fr')).toThrow(/must be a locale definition/)
    expect(() => resolveEponymeLocale({ messages: {} })).toThrow(/must be a locale definition/)
    expect(() => resolveEponymeLocale({ code: 'fr' })).toThrow(/must be a locale definition/)
  })
})

describe('generated module', () => {
  it('carries the catalogue and imports the lookup rather than inlining it', () => {
    const rendered = renderEponymeLocaleModule(resolveEponymeLocale(undefined), '/runtime/utils/translate')

    expect(rendered).toContain('import { createEponymeTranslator } from "/runtime/utils/translate"')
    expect(rendered).toContain('"code":"en-GB"')
    expect(rendered).toContain('"This field is required."')
    expect(rendered).toContain('createEponymeTranslator(messages)')
  })

  it('serialises the plural rule, which is why it has to stand alone', () => {
    const rendered = renderEponymeLocaleModule(
      resolveEponymeLocale({ code: 'ru', messages: {}, plural: (count: number) => (count === 1 ? 0 : 1) }),
      '/runtime/utils/translate',
    )

    // The body has to survive; its exact formatting is the bundler's business.
    expect(rendered).toContain('createEponymeTranslator(messages, ')
    expect(rendered).toContain('count === 1 ? 0 : 1')
  })

  it('serialises a rule that still selects once parsed back', () => {
    const rendered = renderEponymeLocaleModule(
      resolveEponymeLocale({ code: 'ru', messages: { n: 'один | много' }, plural: (count: number) => (count === 1 ? 0 : 1) }),
      '/runtime/utils/translate',
    )
    // What the generated module does when it is loaded: the source becomes a function again.
    const source = rendered.slice(rendered.indexOf('createEponymeTranslator(messages, ') + 'createEponymeTranslator(messages, '.length, rendered.lastIndexOf(')'))
    const revived = new Function(`return (${source})`)() as (count: number) => number
    const t = createEponymeTranslator({ n: 'один | много' }, revived)

    expect([t('n', { count: 1 }), t('n', { count: 4 })]).toEqual(['один', 'много'])
  })
})
