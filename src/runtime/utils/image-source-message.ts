import { locale, t } from '#eponyme/locale'
import type { ImageSource } from '../types/field'
import { classifyEponymeImageSource, eponymeImageSourceLabel } from './image-source'

/** Whether a value is one of the origins the field declared. No declared source accepts any. */
export function isEponymeImageSourceAllowed(value: string, sources: readonly ImageSource[] | undefined): boolean {
  if (!sources?.length) return true
  const source = classifyEponymeImageSource(value)
  return Boolean(source && sources.includes(source))
}

/**
 * Kept out of `image-source.ts`, which `field.image()` reaches from `eponyme.config.ts` and so cannot
 * depend on `#eponyme/locale`.
 */
export function eponymeImageSourceError(sources: readonly ImageSource[]): string {
  const names = sources.map(source => t(eponymeImageSourceLabel(source)))
  return t('field.imageSource', {
    sources: new Intl.ListFormat(locale.code, { type: 'disjunction' }).format(names),
  })
}
