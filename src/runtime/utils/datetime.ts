const dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})$/
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** Normalize a minute-precision ISO instant to its canonical UTC representation. */
export function normalizeEponymeDateTime(value: string): string | null {
  const normalized = value.trim()
  if (!normalized) return ''
  const match = dateTimePattern.exec(normalized)
  if (!match || Number(match[6] ?? 0) !== 0 || Number(match[7] ?? 0) !== 0) return null
  if (!hasValidWallClockParts(match)) return null

  const timestamp = Date.parse(normalized)
  if (Number.isNaN(timestamp)) return null
  const result = new Date(timestamp).toISOString()
  return result.endsWith(':00.000Z') ? result : null
}

export function dateTimeToLocalInput(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = normalizeEponymeDateTime(value)
  if (!normalized) return ''
  const date = new Date(normalized)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localInputToDateTime(value: string): string | null {
  if (!value) return ''
  const match = localDateTimePattern.exec(value)
  if (!match || !hasValidWallClockParts(match)) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0)
  if (
    date.getFullYear() !== Number(match[1])
    || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])
    || date.getHours() !== Number(match[4])
    || date.getMinutes() !== Number(match[5])
  ) return null
  return date.toISOString()
}

function hasValidWallClockParts(match: RegExpExecArray): boolean {
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])))
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    && date.getUTCHours() === Number(match[4])
    && date.getUTCMinutes() === Number(match[5])
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
