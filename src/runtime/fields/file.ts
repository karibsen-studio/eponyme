import type { FileFieldDefinition, FileFieldOptions } from '../types/field'

/**
 * An uploaded file, stored as the URL it is served from.
 *
 * @example
 * ```ts
 * field.file({ label: 'Brochure', accept: ['application/pdf'] })
 * ```
 */
export function file(options: FileFieldOptions = {}): FileFieldDefinition {
  return { type: 'file', options }
}
