import sanitizeHtml from 'sanitize-html'
import type { EponymeSchema } from '../types'
import type { ValidationErrors } from './validate-eponyme-data'
import { mapEponymeRichText } from './rich-text-fields'

/**
 * The HTML a `field.richText()` may hold, kept deliberately close to what the dashboard's
 * TipTap configuration actually emits: anything outside this list could only have arrived
 * from a direct call to the API, never from the editor.
 *
 * Server-side only. It is reached through `normalizeEponymeValues`, which no client module
 * imports – a browser has no business deciding what is safe to store.
 */
const ALLOWED_TAGS = ['p', 'br', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'pre', 'hr', 'strong', 'em', 's', 'u', 'code', 'a', 'img', 'span']

/** What the colour menus write: a hex value, or the `rgb()` a browser may hand back instead. */
const COLOR_VALUES = [/^#[0-9a-f]{3,8}$/i, /^rgba?\((\s*\d{1,3}\s*,){2}\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i]

/** `javascript:` and `data:` are absent by design; so is `//host`, via `allowProtocolRelative`. */
const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel']

/**
 * `download` ships in sanitize-html's default list, which drops an attribute carrying no
 * value – and Eponyme's link extension writes exactly `download=""`. Treated as boolean it
 * survives as `download`, which is what TipTap's `hasAttribute` reads back.
 */
const NON_BOOLEAN_ATTRIBUTES = sanitizeHtml.defaults.nonBooleanAttributes.filter(name => name !== 'download')

const POLICY: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'download'],
    img: ['src', 'alt', 'title'],
    ol: ['start'],
    code: ['class'],
    p: ['style'],
    h2: ['style'],
    h3: ['style'],
    span: ['style'],
  },
  allowedStyles: {
    '*': { 'text-align': [/^left$/, /^center$/, /^right$/] },
    // Text colour and highlight both ride on the `<span>` TipTap's text style mark writes.
    'span': { 'color': COLOR_VALUES, 'background-color': COLOR_VALUES },
  },
  allowedClasses: {
    code: ['language-*'],
    img: ['eponyme-rich-text-image'],
  },
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  nonBooleanAttributes: NON_BOOLEAN_ATTRIBUTES,
  // A relative `/page` or `#anchor` is how an internal Eponyme link is written.
  allowProtocolRelative: false,
  transformTags: {
    a: forceSafeRel,
  },
}

/**
 * Everything the strict policy would reject is allowed here, so the two passes differ only
 * where content was genuinely removed. Comparing against the raw payload instead would flag
 * the serializer's own rewrites – `<br>` read back as `<br />` – as an attack.
 */
const PERMISSIVE: sanitizeHtml.IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  // Its output is only ever compared, never stored nor returned, so letting `script` through
  // is what makes the comparison meaningful rather than a risk.
  allowVulnerableTags: true,
  allowedSchemes: [...ALLOWED_SCHEMES, 'javascript', 'data', 'ftp', 'file', 'sms', 'ssh', 'vbscript'],
  allowProtocolRelative: true,
  nonBooleanAttributes: NON_BOOLEAN_ATTRIBUTES,
  // Kept so that forcing `rel` never reads as content having been stripped.
  transformTags: { a: forceSafeRel },
}

/** A tab opened with `target="_blank"` keeps a handle on the opener without this. */
function forceSafeRel(tagName: string, attribs: Record<string, string>) {
  if (attribs.target === '_blank') attribs.rel = 'noopener noreferrer'
  return { tagName, attribs }
}

export function sanitizeEponymeRichText(html: string): string {
  return sanitizeHtml(html, POLICY)
}

/**
 * Whether the policy removed anything – a tag, an attribute, a scheme – rather than merely
 * reformatting. What it answers is "did this payload carry something the editor cannot
 * produce", which is the only question worth refusing a save over.
 */
export function eponymeRichTextWasStripped(html: string): boolean {
  return sanitizeEponymeRichText(html) !== sanitizeHtml(html, PERMISSIVE)
}

const REJECTION = 'Contains HTML that is not allowed and was removed. Paste the content again as plain text.'

/**
 * Names every rich text field of a payload that carried markup the policy had to remove.
 *
 * A save is refused rather than quietly cleaned: the editor cannot produce this HTML, so
 * either something rewrote the payload on its way here, or an editor is about to lose
 * formatting they can still see on screen. Both are worth saying out loud.
 *
 * Reformatting alone – `<br>` stored as `<br />` – is not a rejection, which is why this
 * asks `eponymeRichTextWasStripped` rather than comparing against the raw string.
 */
export function eponymeRichTextRejections(schema: EponymeSchema, data: Record<string, unknown>): ValidationErrors {
  const errors: ValidationErrors = {}
  mapEponymeRichText(schema, data, (html, path) => {
    if (eponymeRichTextWasStripped(html)) errors[path] = [REJECTION]
    return html
  })
  return errors
}
