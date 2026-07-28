// Compile-only guards. `form()` must not leak into the entry or collection name
// unions, and a form must never be walked as if it were a folder of entries.
import { collection, defineEponymeConfig, field, form } from '../../src/eponyme'
import type { EponymeCollectionName, EponymeFormDataByName, EponymeFormName, EponymeName } from '../../src/runtime/types'

export const config = defineEponymeConfig({
  pages: {
    homepage: { title: field.string({ required: true }) },
  },
  articles: collection({
    titleField: 'title',
    slugField: 'slug',
    fields: { title: field.string(), slug: field.slug() },
  }),
  contact: form({
    fields: {
      name: field.string({ required: true }),
      email: field.email({ required: true }),
      count: field.number(),
      agree: field.boolean(),
    },
    submission: { mode: 'managed' },
  }),
  marketing: {
    newsletter: form({ fields: { email: field.email({ required: true }) } }),
  },
})

type Config = typeof config
type Expect<T extends true> = T
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

export type EntryNamesExcludeForms = Expect<Equals<EponymeName<Config>, 'pages/homepage'>>
export type CollectionNamesExcludeForms = Expect<Equals<EponymeCollectionName<Config>, 'articles'>>
export type FormNamesAreFlattened = Expect<Equals<EponymeFormName<Config>, 'contact' | 'marketing/newsletter'>>
// Mutual assignability rather than strict identity: `EponymeData` is a mapped
// type, so it never compares as identical to an object literal.
type MutuallyAssignable<A, B> = A extends B ? B extends A ? true : false : false

export type FormDataIsInferred = Expect<MutuallyAssignable<
  EponymeFormDataByName<Config, 'contact'>,
  { name: string, email: string, count: number, agree: boolean }
>>
