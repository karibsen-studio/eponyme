/** `true` everywhere, `false` nowhere, or per name – keyed like `previewPaths`. */
export type EponymePublicationOption = boolean | Record<string, boolean>

/** Whether an entry offers the publication tab, and the actions only that tab reaches. */
export function isEponymePublicationEnabled(
  option: EponymePublicationOption | undefined,
  name: string,
  collection?: { name: string, publication?: boolean },
): boolean {
  if (collection?.publication !== undefined) return collection.publication
  if (typeof option === 'object' && option !== null) return option[collection?.name ?? name] ?? true
  return option ?? true
}
