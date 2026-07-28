/**
 * Canonical lowercase 6-digit form of a hex colour, or `undefined` when the value is not one.
 * Comparing swatches needs it: a stored `#FFF` and a preset `#ffffff` are the same colour.
 * Alpha (`#rrggbbaa`) is preserved, since the validator accepts it.
 */
export function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const hex = value.trim().toLowerCase()
  if (/^#[\da-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map(char => char + char).join('')}`
  if (/^#(?:[\da-f]{6}|[\da-f]{8})$/.test(hex)) return hex
  return undefined
}

/** True when both values denote the same colour, whatever their notation. */
export function sameHexColor(left: unknown, right: unknown) {
  const normalizedLeft = normalizeHexColor(left)
  return normalizedLeft !== undefined && normalizedLeft === normalizeHexColor(right)
}
