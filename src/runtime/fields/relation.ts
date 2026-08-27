import type { RelationFieldDefinition, RelationFieldOptions } from '../types/field'

/**
 * Points at one entry of a collection, or at several with `multiple: true`.
 *
 * What is stored is the target's slug, which Eponyme refuses to change after creation – so a
 * reference stays valid for the life of the entry and remains readable in an export.
 */
export function relation<const Multiple extends boolean = false>(
  options: RelationFieldOptions<Multiple>,
): RelationFieldDefinition<Multiple> {
  return { type: 'relation', options }
}
