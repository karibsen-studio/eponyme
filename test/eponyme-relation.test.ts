import { describe, expect, it } from 'vitest'
import { field } from '../src/runtime/fields'
import { EPONYME_RELATION_INDEX_KEY, buildEponymeIndexRows } from '../src/runtime/utils/eponyme-entry-index'
import { collectEponymeRelations } from '../src/runtime/utils/eponyme-relations'
import { createDefaultEponymeData } from '../src/runtime/utils/create-default-eponyme-data'
import { normalizeEponymeValues } from '../src/runtime/utils/normalize-eponyme-values'
import { validateEponymeData } from '../src/runtime/utils/validate-eponyme-data'

const schema = {
  featured: field.relation({ to: 'articles' }),
  related: field.relation({ to: 'articles', multiple: true, maxItems: 2 }),
}

describe('field.relation', () => {
  it('starts empty in the shape it stores', () => {
    expect(createDefaultEponymeData(schema)).toEqual({ featured: '', related: [] })
  })

  it('keeps slugs, drops blanks and never stores the same target twice', () => {
    expect(normalizeEponymeValues(schema, { featured: '  hello  ', related: ['a', '', ' a ', 'b'] }))
      .toEqual({ featured: 'hello', related: ['a', 'b'] })
  })

  it('checks the shape and the bounds, never the existence', () => {
    expect(validateEponymeData(schema, { featured: '', related: [] }, 'publish')).toEqual({})

    const required = { featured: field.relation({ to: 'articles', required: true }) }
    expect(validateEponymeData(required, { featured: '' }, 'publish').featured).toBeDefined()
    // A missing target is only a question the database can answer, so a draft never blocks on it.
    expect(validateEponymeData(required, { featured: 'gone' }, 'publish')).toEqual({})

    expect(validateEponymeData(schema, { featured: '', related: ['a', 'b', 'c'] }, 'publish').related)
      .toEqual(['Must contain at most 2 items.'])
    expect(validateEponymeData(schema, { featured: 42, related: [] }, 'publish').featured).toBeDefined()
  })

  it('finds what an entry points at, however deep the schema puts it', () => {
    const nested = {
      featured: field.relation({ to: 'articles' }),
      hero: field.section({
        fields: { pick: field.relation({ to: 'articles' }) },
      }),
      blocks: field.array({
        of: { link: field.relation({ to: 'articles' }) },
      }),
      content: field.tab({
        tabs: { main: { fields: { pick: field.relation({ to: 'pages' }) } } },
      }),
    }

    const references = collectEponymeRelations(nested, {
      featured: 'root',
      hero: { pick: 'in-a-section' },
      blocks: [{ link: 'in-an-array' }],
      content: { main: { pick: 'in-a-tab' } },
    })

    expect(references.map(reference => `${reference.path}=${reference.entryName}`)).toEqual([
      'featured=articles/root',
      'hero.pick=articles/in-a-section',
      'blocks.0.link=articles/in-an-array',
      'content.main.pick=pages/in-a-tab',
    ])
  })

  it('indexes every reference under one key, so "who points at this" is a lookup', () => {
    const rows = buildEponymeIndexRows('pages/home', schema, {
      draft: { featured: 'Draft-Only', related: [] },
      published: { featured: 'Published', related: ['Other'] },
    })

    const references = rows.filter(row => row.key === EPONYME_RELATION_INDEX_KEY)
    expect(references).toEqual([
      { entryName: 'pages/home', version: 'draft', key: EPONYME_RELATION_INDEX_KEY, value: 'articles/draft-only' },
      { entryName: 'pages/home', version: 'published', key: EPONYME_RELATION_INDEX_KEY, value: 'articles/published' },
      { entryName: 'pages/home', version: 'published', key: EPONYME_RELATION_INDEX_KEY, value: 'articles/other' },
    ])
    // A draft reference counts too: taking its target away would break it just the same.
    expect(references.some(row => row.version === 'draft')).toBe(true)
  })

  it('is filterable at the root, like the other single-value fields', () => {
    const rows = buildEponymeIndexRows('pages/home', schema, {
      draft: { featured: 'Hello', related: [] },
      published: { featured: '', related: [] },
    })
    expect(rows).toContainEqual({ entryName: 'pages/home', version: 'draft', key: 'featured', value: 'hello' })
  })
})
