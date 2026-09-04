import type { RelationFieldDefinition, RelationFieldOptions } from '../types/field'

/** Points at one entry of a collection, or at several with `multiple: true`. */
export function relation<const Multiple extends boolean = false>(
  options: RelationFieldOptions<Multiple>,
): RelationFieldDefinition<Multiple> {
  return { type: 'relation', options }
}
