import type { SectionFieldDefinition } from '../types/field'
import { boolean } from './boolean'
import { image } from './image'
import { section } from './section'
import { string } from './string'
import { textarea } from './textarea'

export interface SeoFieldOptions {
  label?: string
  description?: string
  /** Emits the sharing image. Defaults to `true`. */
  image?: boolean
  /** Emits the Open Graph overrides and the switch that mirrors the page values. Defaults to `true`. */
  social?: boolean
  /**
   * Constants for the whole site rather than per-entry fields, so they are not stored on every
   * entry. They travel on the definition and `resolveEponymeSeo` reads them back.
   */
  siteName?: string
  themeColor?: string
}

/** What an entry stores. Every part is optional: an unfilled entry falls back to the page. */
export interface EponymeSeoValue {
  title?: string
  description?: string
  image?: string
  shareSameAsPage?: boolean
  ogTitle?: string
  ogDescription?: string
}

export interface EponymeSeoDefinition extends SectionFieldDefinition {
  seo: { siteName?: string, themeColor?: string }
}

/** The limits search engines actually honour; past them the text is cut in the results. */
const TITLE_MAX_LENGTH = 60
const DESCRIPTION_MAX_LENGTH = 160

/**
 * A `field.section()` carrying the usual SEO fields, the way `money` is a `field.number()`
 * carrying a currency: a preset, not a type of its own. The stored value stays a plain
 * section, so validation, storage and the schema fingerprint an import is checked against
 * are unchanged.
 *
 * `siteName` and `themeColor` ride on the definition instead of being fields, because they
 * are the same on every entry. The fingerprint only reads field names and types, so carrying
 * them there never invalidates an export.
 */
export function seo(options: SeoFieldOptions = {}): EponymeSeoDefinition {
  const { label = 'SEO', description, image: withImage = true, social = true, siteName, themeColor } = options

  return {
    ...section({
      label,
      description,
      fields: {
        title: string({ maxLength: TITLE_MAX_LENGTH, showCounter: true }),
        description: textarea({ maxLength: DESCRIPTION_MAX_LENGTH, showCounter: true }),
        ...withImage ? { image: image({ label: 'Sharing image' }) } : {},
        // The switch reads as an opt-out: an author who never opens this section shares the
        // page's own title and description, which is the right default.
        ...social
          ? {
              shareSameAsPage: boolean({ label: 'Reuse the title and description when sharing', defaultValue: true }),
              ogTitle: string({ maxLength: TITLE_MAX_LENGTH, showCounter: true, visibleWhen: { field: 'shareSameAsPage', equals: false } }),
              ogDescription: textarea({ maxLength: DESCRIPTION_MAX_LENGTH, showCounter: true, visibleWhen: { field: 'shareSameAsPage', equals: false } }),
            }
          : {},
      },
    }),
    seo: { siteName, themeColor },
  }
}

/**
 * The values to render, with the sharing ones filled in.
 *
 * Nothing is copied at save time: mirroring the title into `ogTitle` would freeze a duplicate
 * that drifts the moment the title changes. The fallback is applied on read instead, so the
 * two can never disagree.
 */
export function resolveEponymeSeo(
  value: EponymeSeoValue | null | undefined,
  definition?: Pick<EponymeSeoDefinition, 'seo'>,
) {
  const stored = value ?? {}
  const mirrors = stored.shareSameAsPage !== false

  return {
    title: stored.title,
    description: stored.description,
    image: stored.image,
    ogTitle: (mirrors ? stored.title : stored.ogTitle) || stored.title,
    ogDescription: (mirrors ? stored.description : stored.ogDescription) || stored.description,
    siteName: definition?.seo.siteName,
    themeColor: definition?.seo.themeColor,
  }
}
