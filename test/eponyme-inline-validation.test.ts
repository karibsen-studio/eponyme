import { describe, expect, it } from 'vitest'
import { changedPaths } from '../src/runtime/utils/changed-paths'

describe('changedPaths', () => {
  it('reports nothing for identical documents', () => {
    const document = { hero: { title: 'a' }, tags: ['x'] }
    expect(changedPaths(document, structuredClone(document))).toEqual([])
  })

  it('reports the path of each changed leaf', () => {
    expect(changedPaths(
      { hero: { title: 'new', theme: 'warm' }, count: 2 },
      { hero: { title: 'old', theme: 'warm' }, count: 2 },
    )).toEqual(['hero.title'])
  })

  it('uses indices for array items', () => {
    expect(changedPaths({ tags: ['a', 'changed'] }, { tags: ['a', 'b'] })).toEqual(['tags.1'])
    expect(changedPaths({ tags: ['a', 'b'] }, { tags: ['a'] })).toEqual(['tags.1'])
    expect(changedPaths(
      { items: [{ title: 'new' }] },
      { items: [{ title: 'old' }] },
    )).toEqual(['items.0.title'])
  })

  it('reports an added or removed key on that key', () => {
    expect(changedPaths({ hero: { title: 'a' } }, {})).toEqual(['hero.title'])
    expect(changedPaths({}, { hero: { title: 'a' } })).toEqual(['hero.title'])
  })

  it('reports the whole field when its shape changes', () => {
    expect(changedPaths({ hero: 'now a string' }, { hero: { title: 'a' } })).toEqual(['hero'])
  })
})
