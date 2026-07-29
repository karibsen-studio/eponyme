import { describe, expect, it } from 'vitest'
import { getDownloadableExtension, isDownloadableLink } from '../src/runtime/utils/downloadable-link'

describe('downloadable links', () => {
  it('detects common downloadable files regardless of case or URL suffixes', () => {
    expect(getDownloadableExtension('/documents/guide.PDF?version=2#download')).toBe('pdf')
    expect(getDownloadableExtension('https://example.com/export/data.txt')).toBe('txt')
    expect(isDownloadableLink('/exports/data.csv')).toBe(true)
    expect(isDownloadableLink('/archives/files.zip')).toBe(true)
  })

  it('does not suggest downloads for regular pages or unknown extensions', () => {
    expect(getDownloadableExtension('/contact')).toBeUndefined()
    expect(isDownloadableLink('https://example.com/article.html')).toBe(false)
    expect(isDownloadableLink('/assets/file.custom')).toBe(false)
  })
})
