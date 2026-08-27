import { describe, expect, it } from 'vitest'
import { permission } from '../src/config/role'
import { canEponyme, matchesEponymeResource } from '../src/runtime/utils/eponyme-permissions'

describe('Eponyme permissions', () => {
  it('inherits folder permissions and keeps unrelated resources closed', () => {
    const rules = [permission.allow(
      ['content.read', 'content.update'],
      permission.folder('blog'),
    )]

    expect(canEponyme(rules, 'content.update', { kind: 'collection', name: 'blog/articles' })).toBe(true)
    expect(canEponyme(rules, 'content.read', { kind: 'singleton', name: 'blog/settings' })).toBe(true)
    expect(canEponyme(rules, 'content.update', { kind: 'collection', name: 'shop/products' })).toBe(false)
    expect(canEponyme(rules, 'content.publish', { kind: 'collection', name: 'blog/articles' })).toBe(false)
  })

  it('lets an exact denial override an inherited allowance', () => {
    const rules = [
      permission.allow('content.publish', permission.folder('blog')),
      permission.deny('content.publish', permission.collection('blog/private')),
    ]

    expect(canEponyme(rules, 'content.publish', { kind: 'collection', name: 'blog/articles' })).toBe(true)
    expect(canEponyme(rules, 'content.publish', { kind: 'collection', name: 'blog/private' })).toBe(false)
  })

  it('keeps a folder rule away from a system feature of the same name', () => {
    expect(matchesEponymeResource(
      permission.folder('media'),
      { kind: 'system', name: 'media' },
    )).toBe(false)
    expect(canEponyme(
      [permission.allow(['content.read', 'content.export'], permission.folder('content'))],
      'content.export',
      { kind: 'system', name: 'content' },
    )).toBe(false)
    expect(canEponyme(
      [permission.allow('media.read', permission.system('media'))],
      'media.read',
      { kind: 'system', name: 'media' },
    )).toBe(true)
  })

  it('matches exact resource kinds instead of names alone', () => {
    expect(matchesEponymeResource(
      permission.collection('contact'),
      { kind: 'form', name: 'contact' },
    )).toBe(false)
    expect(matchesEponymeResource(
      permission.form('contact'),
      { kind: 'form', name: 'contact' },
    )).toBe(true)
  })
})
