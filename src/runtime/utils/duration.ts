import type { DurationInput } from '../types/field'

const UNIT_IN_MS = {
  h: 3_600_000,
  min: 60_000,
  s: 1_000,
  ms: 1,
} as const

const durationToken = /\s*(\d+)\s*(ms|min|h|s)\s*/gy

/** Convert milliseconds or a readable `h min s ms` duration to milliseconds. */
export function toMs(value: DurationInput): number {
  if (typeof value === 'number') return assertMilliseconds(value)

  if (!value.trim()) throw new TypeError('[Eponyme] A duration cannot be empty.')

  let total = 0
  let cursor = 0
  const units = new Set<string>()
  durationToken.lastIndex = 0

  while (cursor < value.length) {
    durationToken.lastIndex = cursor
    const match = durationToken.exec(value)
    if (!match || match.index !== cursor)
      throw new TypeError(`[Eponyme] Invalid duration "${value}". Use h, min, s and ms.`)

    const amount = Number(match[1])
    const unit = match[2] as keyof typeof UNIT_IN_MS
    if (units.has(unit)) throw new TypeError(`[Eponyme] Duration unit "${unit}" is repeated.`)
    units.add(unit)

    const part = amount * UNIT_IN_MS[unit]
    if (!Number.isSafeInteger(part) || !Number.isSafeInteger(total + part))
      throw new RangeError('[Eponyme] Duration exceeds Number.MAX_SAFE_INTEGER milliseconds.')

    total += part
    cursor = durationToken.lastIndex
  }

  return total
}

function assertMilliseconds(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError('[Eponyme] A duration must be a non-negative safe integer of milliseconds.')
  return value
}

export interface DurationParts {
  hours: number
  minutes: number
  seconds: number
  milliseconds: number
}

export function splitMilliseconds(value: unknown): DurationParts {
  const total = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
  const hours = Math.floor(total / UNIT_IN_MS.h)
  const afterHours = total % UNIT_IN_MS.h
  const minutes = Math.floor(afterHours / UNIT_IN_MS.min)
  const afterMinutes = afterHours % UNIT_IN_MS.min
  const seconds = Math.floor(afterMinutes / UNIT_IN_MS.s)
  return { hours, minutes, seconds, milliseconds: afterMinutes % UNIT_IN_MS.s }
}

export function joinMilliseconds(parts: DurationParts): number {
  return toMs(
    parts.hours * UNIT_IN_MS.h
    + parts.minutes * UNIT_IN_MS.min
    + parts.seconds * UNIT_IN_MS.s
    + parts.milliseconds,
  )
}
