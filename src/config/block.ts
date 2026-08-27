import { section } from '../runtime/fields/section'
import type { FieldVisibilityCondition, SectionFieldDefinition, SectionSchema } from '../runtime/types/field'

export interface EponymeBlockOptions<T extends SectionSchema> {
  name: string
  label: string
  description?: string
  fields: T
}

/**
 * What a call site may change. Deliberately not the whole of `SectionFieldOptions`: a block
 * owns what it holds, and a page owns how it is introduced and when it is shown.
 */
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
 * What it produces is a plain `field.section()`, the way `field.seo()` does: the stored value
 * is a section, validation, normalisation, the index and the schema fingerprint see a section,
 * and nothing in Eponyme has to learn a new kind of field. `name` rides on the definition
 * beside `type` and `options`, which the fingerprint never reads – so declaring a block, or
 * renaming one, cannot invalidate an export.
 *
 * Each call site gets its own copy of the data. Two pages using the same block hold the same
 * shape, not the same content: nothing is shared between the entries.
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
 *
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
