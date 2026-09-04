import { section } from '../runtime/fields/section'
import type { FieldVisibilityCondition, SectionFieldDefinition, SectionSchema } from '../runtime/types/field'

export interface EponymeBlockOptions<T extends SectionSchema> {
  name: string
  label: string
  description?: string
  fields: T
}

/** What a call site may change. */
export interface EponymeBlockOverrides {
  label?: string
  description?: string
  visibleWhen?: FieldVisibilityCondition | FieldVisibilityCondition[]
}

export interface EponymeBlockDefinition<T extends SectionSchema> extends SectionFieldDefinition<T> {
  block: { name: string }
}

export type EponymeBlock<T extends SectionSchema> = (overrides?: EponymeBlockOverrides) => EponymeBlockDefinition<T>

/**
 * A group of fields written once and placed in several schemas.
 *
 * @example
 * ```ts
 * // eponyme/blocks/hero.ts
 * export const heroBlock = defineBlock({
 *   name: 'hero',
 *   label: 'Hero',
 *   fields: {
 *     eyebrow: field.string({ maxLength: 40 }),
 *     title: field.string({ required: true }),
 *   },
 * })
 * // eponyme.config.ts
 * hero: heroBlock(),
 * header: heroBlock({ label: 'Header', visibleWhen: { field: 'showHeader', equals: true } }),
 * ```
 */
export function defineBlock<const T extends SectionSchema>(block: EponymeBlockOptions<T>): EponymeBlock<T> {
  return (overrides: EponymeBlockOverrides = {}) => ({
    ...section({
      label: overrides.label ?? block.label,
      description: overrides.description ?? block.description,
      visibleWhen: overrides.visibleWhen,
      fields: block.fields,
    }),
    block: { name: block.name },
  })
}
