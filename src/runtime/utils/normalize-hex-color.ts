/** What a browser hands back from `element.style.color`, which is never the hex that was written. */
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/

/**
 * Canonical lowercase 6-digit form of a hex colour, or `undefined` when the value is not one.
 * Comparing swatches needs it: a stored `#FFF` and a preset `#ffffff` are the same colour.
 * Alpha (`#rrggbbaa`) is preserved, since the validator accepts it.
 *
 * An opaque `rgb()` is read as well – the rich text editor reads its colours back off the
 * DOM, where a browser has already rewritten them into that notation.
 */
export function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const hex = value.trim().toLowerCase()
  if (/^#[\da-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map(char => char + char).join('')}`
  if (/^#(?:[\da-f]{6}|[\da-f]{8})$/.test(hex)) return hex
  const rgb = RGB.exec(hex)
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number)
    if (channels.every(channel => channel <= 255)) return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
  }
  return undefined
}

/** True when both values denote the same colour, whatever their notation. */
export function sameHexColor(left: unknown, right: unknown) {
  const normalizedLeft = normalizeHexColor(left)
  return normalizedLeft !== undefined && normalizedLeft === normalizeHexColor(right)
}
