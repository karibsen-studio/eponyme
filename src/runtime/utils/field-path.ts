import type { ValidationErrors } from './validate-eponyme-data'

/** `hero` + `title` -> `hero.title`; array items use their index as a segment. */
export function joinFieldPath(prefix: string, segment: string | number) {
  return prefix ? `${prefix}.${segment}` : String(segment)
}

/** Stable DOM id for a field path, usable in `for`/`aria-*` attributes. */
export function fieldPathId(path: string) {
  return `field-${path.replace(/\./g, '-')}`
}

/** Messages recorded for this exact path. */
export function errorsAt(errors: ValidationErrors | undefined, path: string) {
  return errors?.[path] ?? []
}

/**
 * Errors of everything nested under `path`, re-keyed relative to it, so a container can hand its children
 * exactly what concerns them without knowing its own depth.
 */
export function childErrors(errors: ValidationErrors | undefined, path: string): ValidationErrors {
  if (!errors) return {}
  const prefix = `${path}.`
  const nested: ValidationErrors = {}
  for (const [key, messages] of Object.entries(errors)) {
    if (key.startsWith(prefix)) nested[key.slice(prefix.length)] = messages
  }
  return nested
}

/** True when this path, or anything under it, has at least one message. */
export function hasErrorsUnder(errors: ValidationErrors | undefined, path: string) {
  if (!errors) return false
  const prefix = `${path}.`
  return Object.keys(errors).some(key => key === path || key.startsWith(prefix))
}
