const DOWNLOADABLE_EXTENSIONS = new Set([
  '7z',
  'apk',
  'bz2',
  'csv',
  'dmg',
  'doc',
  'docx',
  'epub',
  'gz',
  'json',
  'odg',
  'odp',
  'ods',
  'odt',
  'pdf',
  'ppt',
  'pptx',
  'rar',
  'rtf',
  'tar',
  'txt',
  'xls',
  'xlsx',
  'xml',
  'zip',
])

export function getDownloadableExtension(href: string): string | undefined {
  const path = href.trim().split(/[?#]/, 1)[0] ?? ''
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  return extension && DOWNLOADABLE_EXTENSIONS.has(extension) ? extension : undefined
}

export function isDownloadableLink(href: string): boolean {
  return getDownloadableExtension(href) !== undefined
}
