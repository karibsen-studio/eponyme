import type { ImageFieldDefinition, ImageFieldOptions } from '../types/field'

export function image(options: ImageFieldOptions = {}): ImageFieldDefinition {
  return { type: 'image', options }
}
