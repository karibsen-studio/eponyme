/**
 * The markup is sanitized, but the container decides how a browser reads it: `script` and `style` turn the
 * same string into an active context, so only inert containers are accepted.
 */
const ALLOWED_CONTAINERS = ['div', 'section', 'article', 'aside', 'main', 'span']

export function isEponymeRichTextContainer(tag: string): boolean {
  return ALLOWED_CONTAINERS.includes(tag)
}

export function eponymeRichTextContainer(tag: string): string {
  return isEponymeRichTextContainer(tag) ? tag : 'div'
}
