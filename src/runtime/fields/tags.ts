import type { TagsFieldDefinition, TagsFieldOptions } from '../types/field'

/**
 * The whole options object is the type parameter, so the literals an author writes —
 * the suggestions and `allowCustom` — survive into the value type. See `TagsValueOf`.
 */
export function tags<const O extends TagsFieldOptions>(options: O = {} as O): TagsFieldDefinition<O> {
  return { type: 'tags', options }
}
