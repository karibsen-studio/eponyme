import slugify from 'slugify'

export function normalizeSlug(value: string): string {
  return slugify(value, { lower: true, strict: true, trim: true })
}
