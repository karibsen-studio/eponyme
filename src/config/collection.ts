import type { CollectionSlugField, EponymeCollectionDefinition, EponymeCollectionOptions, EponymeSchema } from '../runtime/types'

type CollectionOptions<T extends EponymeSchema> = Omit<EponymeCollectionOptions<T>, 'slugField'> & {
  slugField: CollectionSlugField<T>
}

export function collection<const T extends EponymeSchema>(options: CollectionOptions<T>): EponymeCollectionDefinition<T> {
  if (options.fields[options.slugField]?.type !== 'slug')
    throw new TypeError(`[Eponyme] Collection slug field "${options.slugField}" must use field.slug().`)

  return { __eponymeCollection: true, ...options } as EponymeCollectionDefinition<T>
}
