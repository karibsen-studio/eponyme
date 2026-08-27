import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import {
  renderEponymeCustomFieldComponents,
  renderEponymeCustomFields,
  renderEponymeCustomFieldTypes,
  scanEponymeCustomFields,
} from '../src/custom-fields-build'

let fixtureRoot: string | undefined

afterEach(async () => {
  if (fixtureRoot)
    await rm(fixtureRoot, { recursive: true, force: true })
  fixtureRoot = undefined
})

async function createFixture(files: string[]): Promise<string> {
  fixtureRoot = await mkdtemp(resolve(tmpdir(), 'eponyme-custom-fields-'))
  const directory = resolve(fixtureRoot, 'eponyme/fields')
  await mkdir(directory, { recursive: true })
  await Promise.all(files.map(file => writeFile(resolve(directory, file), 'export default {}\n')))
  return fixtureRoot
}

describe('custom field build discovery', () => {
  it('returns no fields when eponyme/fields does not exist', async () => {
    fixtureRoot = await mkdtemp(resolve(tmpdir(), 'eponyme-custom-fields-'))
    await expect(scanEponymeCustomFields(fixtureRoot)).resolves.toEqual([])
  })

  it('pairs definitions and components in a stable order', async () => {
    const root = await createFixture(['stars.vue', 'rating.ts', 'stars.ts', 'rating.vue'])

    await expect(scanEponymeCustomFields(root)).resolves.toEqual([
      {
        name: 'rating',
        definitionPath: resolve(root, 'eponyme/fields/rating.ts'),
        componentPath: resolve(root, 'eponyme/fields/rating.vue'),
      },
      {
        name: 'stars',
        definitionPath: resolve(root, 'eponyme/fields/stars.ts'),
        componentPath: resolve(root, 'eponyme/fields/stars.vue'),
      },
    ])
  })

  it('refuses incomplete pairs and invalid names', async () => {
    const missingComponentRoot = await createFixture(['rating.ts'])
    await expect(scanEponymeCustomFields(missingComponentRoot)).rejects.toThrow(/rating\.vue/)

    await rm(missingComponentRoot, { recursive: true, force: true })
    const invalidNameRoot = await createFixture(['Rating.ts', 'Rating.vue'])
    await expect(scanEponymeCustomFields(invalidNameRoot)).rejects.toThrow(/lowercase/)
  })

  it('generates separate definition, Vue component and type registries', () => {
    const sources = [{
      name: 'rating',
      definitionPath: '/app/eponyme/fields/rating.ts',
      componentPath: '/app/eponyme/fields/rating.vue',
    }]

    expect(renderEponymeCustomFields(sources)).toContain('"rating": field0')
    expect(renderEponymeCustomFieldComponents(sources)).toContain('defineAsyncComponent(() => import("/app/eponyme/fields/rating.vue"))')
    expect(renderEponymeCustomFieldTypes(sources)).toContain('readonly "rating": typeof import("/app/eponyme/fields/rating.ts")')
  })
})
