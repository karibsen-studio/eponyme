interface EponymeIntegerRange {
  fallback: number
  min?: number
  max?: number
  /** The module colours its own prefix; a config helper called at build time does not. */
  prefix?: string
}

/**
 * A configured number reaches a cache header, a cookie expiry or a body limit as it was written: `NaN`,
 * `Infinity`, a negative value and a value far past what the unit can mean all read there as something
 * else entirely, and none of them announce themselves. They are refused at build time instead.
 */
export function eponymeConfigInteger(name: string, value: number | undefined, range: EponymeIntegerRange): number {
  const { fallback, min = 1, max = Number.MAX_SAFE_INTEGER, prefix = '[Eponyme]' } = range
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max)
    throw new TypeError(`${prefix} ${name} must be an integer between ${min} and ${max}.`)
  return resolved
}
