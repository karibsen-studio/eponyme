import type { EponymeVariables } from '../runtime/types/variables'

/** Declares the variables editors can drop into rich text with `{{ name }}`. */
export function defineEponymeVariables<const T extends EponymeVariables>(variables: T): T {
  return variables
}
