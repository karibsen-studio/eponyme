export type EponymeTranslateParams = Record<string, string | number>

/**
 * None, one, many. A locale that only distinguishes two forms writes the same text twice
 * rather than shortening the list, so every catalogue entry has the same shape.
 */
export function defaultEponymePlural(count: number): number {
  return count === 0 ? 0 : count === 1 ? 1 : 2
}

/**
 * Builds the `t` of a resolved catalogue.
 *
 * The catalogue is decided at build time and never changes afterwards, so this is a closure
 * over a constant rather than a composable: no reactivity, no injection, callable from a
 * server route as readily as from a component.
 *
 * A key with no message returns the key itself. That only happens when the key exists in
 * neither the locale nor the English fallback, which the build already warns about — showing
 * it raw is more useful than showing nothing.
 */
export function createEponymeTranslator(
  messages: Record<string, string>,
  plural: (count: number) => number = defaultEponymePlural,
) {
  return function translate(key: string, params?: EponymeTranslateParams): string {
    const message = messages[key]
    if (message === undefined) return key
    return interpolate(selectForm(message, plural, params?.count), params)
  }
}

/** Plural forms are separated by `|`; a message without one is used as it is. */
function selectForm(message: string, plural: (count: number) => number, count: unknown): string {
  if (!message.includes('|')) return message
  const forms = message.split('|').map(form => form.trim())
  // Without a count there is nothing to select on, so the general form is the safe one.
  const index = typeof count === 'number' ? plural(count) : forms.length - 1
  return forms[Math.min(Math.max(index, 0), forms.length - 1)] ?? message
}

function interpolate(message: string, params?: EponymeTranslateParams): string {
  if (!params || !message.includes('{')) return message
  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}
