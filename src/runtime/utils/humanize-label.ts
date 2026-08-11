/**
 * Turns a field name into a human label: `launch_date` -> `Launch Date`,
 * `productionPhoto` -> `Production Photo`.
 * Shared by every layer so what the editor shows and what error messages refer to
 * can never drift apart.
 */
export function humanizeLabel(name: string, configured?: string) {
  if (configured) return configured

  return name
    .replace(/[-_]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // An acronym keeps its run together: `heroSEOTitle` splits before `Title`, not inside `SEO`.
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase())
}
