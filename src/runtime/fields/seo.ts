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
  /** Constants for the whole site rather than per-entry fields, so they are not stored on every entry. */
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
 * A `field.section()` carrying the usual SEO fields, the way `money` is a `field.number()` carrying a
 * currency: a preset, not a type of its own.
 */
export function seo(options: SeoFieldOptions = {}): EponymeSeoDefinition {
  const { label = 'seo.label', description, image: withImage = true, social = true, siteName, themeColor } = options

  return {
    ...section({
      label,
      description,
      fields: {
        // Message keys, not text: this file is evaluated by Node when the application config is read, where
        // `#eponyme/locale` does not resolve.
        title: string({ label: 'seo.title', maxLength: TITLE_MAX_LENGTH, showCounter: true }),
        description: textarea({ label: 'seo.description', maxLength: DESCRIPTION_MAX_LENGTH, showCounter: true }),
        ...withImage ? { image: image({ label: 'seo.image' }) } : {},
        // The switch reads as an opt-out: an author who never opens this section shares the page's own
        // title and description, which is the right default.
        ...social
          ? {
              shareSameAsPage: boolean({ label: 'seo.shareSameAsPage', defaultValue: true }),
              ogTitle: string({ label: 'seo.ogTitle', maxLength: TITLE_MAX_LENGTH, showCounter: true, visibleWhen: { field: 'shareSameAsPage', equals: false } }),
              ogDescription: textarea({ label: 'seo.ogDescription', maxLength: DESCRIPTION_MAX_LENGTH, showCounter: true, visibleWhen: { field: 'shareSameAsPage', equals: false } }),
            }
          : {},
      },
    }),
    seo: { siteName, themeColor },
  }
}

/** The values to render, with the sharing ones filled in. */
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
