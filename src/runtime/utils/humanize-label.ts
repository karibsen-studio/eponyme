/**
 * Turns a field name into a human label: `launch_date` -> `Launch Date`.
 * Shared by every layer so what the editor shows and what error messages refer to
 * can never drift apart.
 */
export function humanizeLabel(name: string, configured?: string) {
  return configured || name.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}
