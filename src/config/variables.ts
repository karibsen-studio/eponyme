import type { EponymeVariables } from '../runtime/types/variables'

/**
 * Declares the variables editors can drop into rich text with `{{ name }}`.
 * Place them in `eponyme.variables.ts` at the project root:
 *
 * ```ts
 * export default defineEponymeVariables({
 *   clubName: 'AS Chelles Athlétisme',
 *   season: {
 *     label: 'Season',
 *     value: () => `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
 *   },
 * })
 * ```
 *
 * A function is called on every read, so the value stays current without anyone
 * re-saving the content.
 */
export function defineEponymeVariables<const T extends EponymeVariables>(variables: T): T {
  return variables
}
