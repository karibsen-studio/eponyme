import { t } from '#eponyme/locale'

/**
 * Turns a field name into a human label: `launch_date` -> `Launch Date`, `productionPhoto` -> `Production
 * Photo`.
 */
export function humanizeLabel(name: string, configured?: string) {
  // A label the module wrote is a message key, so it reads in the dashboard's own language.
  if (configured) return t(configured as Parameters<typeof t>[0])

  return name
    .replace(/[-_]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // An acronym keeps its run together: `heroSEOTitle` splits before `Title`, not inside `SEO`.
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase())
}
