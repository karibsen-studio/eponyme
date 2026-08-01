// Compile-only guards on the value a field infers. A tag list must never mix types: with a
// closed list it is the union of the suggestions, and only `allowCustom` widens it to `string`.
import { defineEponymeConfig, field } from '../../src/eponyme'
import type { EponymeDataByName, MediaPlayerValue } from '../../src/runtime/types'

export const config = defineEponymeConfig({
  post: {
    closed: field.tags({ suggestions: ['Nuxt', 'Vue'] }),
    open: field.tags({ suggestions: ['Nuxt'], allowCustom: true }),
    free: field.tags(),
    video: field.mediaPlayer(),
    videos: field.array({ of: { video: field.mediaPlayer() } }),
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
