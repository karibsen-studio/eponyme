// Compile-only guards on the value a field infers. A tag list must never mix types: with a
// closed list it is the union of the suggestions, and only `allowCustom` widens it to `string`.
import { defineEponymeConfig, field } from '../../src/eponyme'
import type { EponymeCustomFieldTypeDefinition, EponymeDataByName, MediaPlayerValue } from '../../src/runtime/types'

interface RatingOptions {
  min?: number
  max?: number
}

declare module '#eponyme/custom-fields' {
  interface EponymeCustomFieldRegistry {
    rating: EponymeCustomFieldTypeDefinition<number, RatingOptions>
  }
}

export const config = defineEponymeConfig({
  post: {
    closed: field.tags({ suggestions: ['Nuxt', 'Vue'] }),
    open: field.tags({ suggestions: ['Nuxt'], allowCustom: true }),
    free: field.tags(),
    video: field.mediaPlayer(),
    videos: field.array({ of: { video: field.mediaPlayer() } }),
    price: field.number({ min: 0, prefix: '€', suffix: '/month' }),
    amount: field.money({ currency: 'JPY' }),
    startsAt: field.datetime(),
    runtime: field.duration({ defaultValue: '1h 10min' }),
    chapters: field.array({ of: { runtime: field.duration() } }),
    rating: field.custom('rating', { min: 1, max: 5 }),
    review: field.section({ fields: { rating: field.custom('rating') } }),
    ratings: field.array({ of: { rating: field.custom('rating') } }),
  },
})

type Data = EponymeDataByName<typeof config, 'post'>
type Expect<T extends true> = T
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

export type ClosedTagsAreTheSuggestions = Expect<Equals<Data['closed'], Array<'Nuxt' | 'Vue'>>>
export type CustomTagsWidenToStrings = Expect<Equals<Data['open'], string[]>>
export type TagsWithoutSuggestionsAreStrings = Expect<Equals<Data['free'], string[]>>
export type MediaPlayerIsItsOwnValue = Expect<Equals<Data['video'], MediaPlayerValue>>
export type MediaPlayerSurvivesAnArray = Expect<Equals<Data['videos'], Array<{ readonly video: MediaPlayerValue }>>>
export type AdornmentsLeaveTheValueANumber = Expect<Equals<Data['price'], number>>
export type MoneyIsStillANumber = Expect<Equals<Data['amount'], number>>
export type DateTimeIsAString = Expect<Equals<Data['startsAt'], string>>
export type DurationIsANumber = Expect<Equals<Data['runtime'], number>>
export type DurationSurvivesAnArray = Expect<Equals<Data['chapters'], Array<{ readonly runtime: number }>>>
export type CustomFieldKeepsItsValue = Expect<Equals<Data['rating'], number>>
export type CustomFieldSurvivesASection = Expect<Equals<Data['review'], { readonly rating: number }>>
export type CustomFieldSurvivesAnArray = Expect<Equals<Data['ratings'], Array<{ readonly rating: number }>>>
