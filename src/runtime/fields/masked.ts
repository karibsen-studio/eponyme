import type { StringFieldDefinition, StringFieldOptions } from '../types/field'
import { string } from './string'

export interface MaskedFieldOptions extends Omit<StringFieldOptions, 'regex'> {
  /** `#` a digit, `@` a letter, `*` either. Every other character is a literal. */
  mask: string
}

const TOKENS: Record<string, string> = {
  '#': '\\d',
  '@': '[a-zA-Z]',
  '*': '[a-zA-Z0-9]',
}

/** A `field.string()` carrying an input mask. */
export function masked({ mask, ...rest }: MaskedFieldOptions): StringFieldDefinition {
  return string({ ...rest, mask, regex: maskToRegex(mask) })
}

/**
 * Optional around the whole mask: `regex` is checked even when the value is empty, and an untouched
 * optional field is not a badly formatted one.
 */
function maskToRegex(mask: string): RegExp {
  const source = [...mask]
    .map(character => TOKENS[character] ?? character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('')
  return new RegExp(`^(?:${source})?$`)
}
