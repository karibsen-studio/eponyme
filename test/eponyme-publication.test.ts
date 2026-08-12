import { describe, expect, it } from 'vitest'
import { isEponymePublicationEnabled } from '../src/runtime/utils/eponyme-publication'

const articles = { name: 'articles', publication: undefined }

describe('isEponymePublicationEnabled', () => {
  it('is enabled when nothing says otherwise', () => {
    expect(isEponymePublicationEnabled(undefined, 'pages/homepage')).toBe(true)
    expect(isEponymePublicationEnabled(true, 'pages/homepage')).toBe(true)
  })

  it('reads a boolean as the answer for every entry', () => {
    expect(isEponymePublicationEnabled(false, 'pages/homepage')).toBe(false)
    expect(isEponymePublicationEnabled(false, 'articles/hello', articles)).toBe(false)
  })

  it('reads a record by singleton name, leaving unlisted names enabled', () => {
    const option = { 'pages/homepage': false }
    expect(isEponymePublicationEnabled(option, 'pages/homepage')).toBe(false)
    expect(isEponymePublicationEnabled(option, 'pages/legal')).toBe(true)
  })

  it('reads a record by collection name rather than by entry name', () => {
    const option = { articles: false }
    expect(isEponymePublicationEnabled(option, 'articles/hello', articles)).toBe(false)
    // The entry's own name is never a key: a collection decides for all of its entries.
    expect(isEponymePublicationEnabled({ 'articles/hello': false }, 'articles/hello', articles)).toBe(true)
  })

  it('lets a collection override the module option in both directions', () => {
    expect(isEponymePublicationEnabled(false, 'articles/hello', { name: 'articles', publication: true })).toBe(true)
    expect(isEponymePublicationEnabled(true, 'articles/hello', { name: 'articles', publication: false })).toBe(false)
    expect(isEponymePublicationEnabled({ articles: true }, 'articles/hello', { name: 'articles', publication: false })).toBe(false)
  })
})
