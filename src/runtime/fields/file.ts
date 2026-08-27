import type { FileFieldDefinition, FileFieldOptions } from '../types/field'

/**
 * An uploaded file, stored as the URL it is served from.
 *
 * @remarks
 * Requires storage: the field only offers an upload when `eponyme.storage.ts` exists. Without
 * it, it falls back to a plain address input, so an entry keeps a usable field rather than an
 * inert one.
 *
 * The stored value is a URL, not a key – which is what lets `field.image()` be the same field
 * with a preview, and what keeps a value written before storage existed still valid.
 *
 * @example
 * ```ts
 * field.file({ label: 'Brochure', accept: ['application/pdf'] })
 * ```
 */
export function file(options: FileFieldOptions = {}): FileFieldDefinition {
  return { type: 'file', options }
}
