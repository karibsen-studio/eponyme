export type EponymeTranslateParams = Record<string, string | number>

/** None, one, many. */
export function defaultEponymePlural(count: number): number {
  return count === 0 ? 0 : count === 1 ? 1 : 2
}

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
