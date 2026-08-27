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

/**
 * A `field.string()` carrying an input mask.
 *
 * It builds a string rather than declaring a type of its own, so the value stays a plain
 * `string` and every path a string already travels is unchanged. That also keeps exports
 * valid: `schemaFingerprint()` hashes the field type, so a new type would refuse to import
 * a file taken before the mask was added.
 *
 * The mask produces the regex as well as the formatting, because the server never sees the
 * mask – without it, a direct API call could store what the editor makes impossible to type.
 */
export function masked({ mask, ...rest }: MaskedFieldOptions): StringFieldDefinition {
  return string({ ...rest, mask, regex: maskToRegex(mask) })
}

/**
 * Optional around the whole mask: `regex` is checked even when the value is empty, and an
 * untouched optional field is not a badly formatted one. Presence stays `required`'s job.
 */
function maskToRegex(mask: string): RegExp {
  const source = [...mask]
    .map(character => TOKENS[character] ?? character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('')
  return new RegExp(`^(?:${source})?$`)
}
