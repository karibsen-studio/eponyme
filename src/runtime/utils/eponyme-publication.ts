/** `true` everywhere, `false` nowhere, or per name – keyed like `previewPaths`. */
export type EponymePublicationOption = boolean | Record<string, boolean>

/**
 * Whether an entry offers the publication tab, and the actions only that tab reaches.
 *
 * A collection decides for its own entries first, then the module option, which is read by
 * collection name for a collection entry and by singleton name otherwise. Shared by the editor
 * and the API so a hidden action and a refused one are never decided differently.
 */
export function isEponymePublicationEnabled(
  option: EponymePublicationOption | undefined,
  name: string,
  collection?: { name: string, publication?: boolean },
): boolean {
  if (collection?.publication !== undefined) return collection.publication
  if (typeof option === 'object' && option !== null) return option[collection?.name ?? name] ?? true
  return option ?? true
}
