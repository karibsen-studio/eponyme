import type { ColorFieldDefinition, ColorFieldOptions } from '../types/field'

export function color(options: ColorFieldOptions = {}): ColorFieldDefinition {
  return { type: 'color', options }
}
