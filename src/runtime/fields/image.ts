import type { ImageFieldDefinition, ImageFieldOptions } from '../types/field'
import { normalizeEponymeImageSources } from '../utils/image-source'

/**
 * A picture: {@link file} with images preselected and a preview, the way `field.money()` is
 * `field.number()` with a currency.
 */
export function image(options: ImageFieldOptions = {}): ImageFieldDefinition {
  return {
    type: 'image',
    options: {
      accept: ['image/*'],
      ...options,
      sources: normalizeEponymeImageSources(options.sources),
    },
  }
}
