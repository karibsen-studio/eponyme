import sanitizeHtml from 'sanitize-html'
import type { EponymeSchema } from '../types'
import type { ValidationErrors } from './validate-eponyme-data'
import { mapEponymeRichText } from './rich-text-fields'

/**
 * The HTML a `field.richText()` may hold, kept deliberately close to what the dashboard's TipTap
 * configuration actually emits: anything outside this list could only have arrived from a direct call to
 * the API, never from the editor.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'pre', 'hr', 'strong', 'em', 's', 'u', 'code', 'a', 'img', 'span',
  'table', 'colgroup', 'col', 'tbody', 'tr', 'th', 'td',
]

/** The widths TipTap writes on a table and its columns. */
const WIDTH_VALUES = [/^\d+(\.\d+)?px$/]

const CELL_ALIGN = [/^left$/, /^center$/, /^right$/]

/** What the colour menus write: a hex value, or the `rgb()` a browser may hand back instead. */
const COLOR_VALUES = [/^#[0-9a-f]{3,8}$/i, /^rgba?\((\s*\d{1,3}\s*,){2}\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i]

/** `javascript:` and `data:` are absent by design; so is `//host`, via `allowProtocolRelative`. */
const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel']

/**
 * `download` ships in sanitize-html's default list, which drops an attribute carrying no value - and
 * Eponyme's link extension writes exactly `download=""`.
 */
const NON_BOOLEAN_ATTRIBUTES = sanitizeHtml.defaults.nonBooleanAttributes.filter(name => name !== 'download')

/** `col` is void in HTML and absent from the default list, which would write `<col></col>`. */
const SELF_CLOSING = [...sanitizeHtml.defaults.selfClosing, 'col']

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
    table: ['style'],
    col: ['style', 'span'],
    th: ['colspan', 'rowspan', 'colwidth', 'style'],
    td: ['colspan', 'rowspan', 'colwidth', 'style'],
  },
  allowedStyles: {
    '*': { 'text-align': [/^left$/, /^center$/, /^right$/] },
    // Text colour and highlight both ride on the `<span>` TipTap's text style mark writes.
    'span': { 'color': COLOR_VALUES, 'background-color': COLOR_VALUES },
    'table': { 'width': WIDTH_VALUES, 'min-width': WIDTH_VALUES },
    'col': { 'width': WIDTH_VALUES, 'min-width': WIDTH_VALUES },
    'th': { 'text-align': CELL_ALIGN },
    'td': { 'text-align': CELL_ALIGN },
  },
  allowedClasses: {
    code: ['language-*'],
    img: ['eponyme-rich-text-image'],
  },
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  nonBooleanAttributes: NON_BOOLEAN_ATTRIBUTES,
  selfClosing: SELF_CLOSING,
  // A relative `/page` or `#anchor` is how an internal Eponyme link is written.
  allowProtocolRelative: false,
  transformTags: {
    a: normalizeAnchor,
  },
}

/**
 * Everything the strict policy would reject is allowed here, so the two passes differ only where content
 * was genuinely removed.
 */
const PERMISSIVE: sanitizeHtml.IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  // Its output is only ever compared, never stored nor returned, so letting `script` through is what makes
  // the comparison meaningful rather than a risk.
  allowVulnerableTags: true,
  allowedSchemes: [...ALLOWED_SCHEMES, 'javascript', 'data', 'ftp', 'file', 'sms', 'ssh', 'vbscript'],
  allowProtocolRelative: true,
  nonBooleanAttributes: NON_BOOLEAN_ATTRIBUTES,
  selfClosing: SELF_CLOSING,
  // Kept so that forcing `rel` never reads as content having been stripped.
  transformTags: { a: forceSafeRel },
}

/**
 * The two targets the editor writes. `_top` and `_parent` reach the document that frames the page, which is
 * how a link inside the dashboard's preview would replace the dashboard itself.
 */
const ALLOWED_TARGETS = ['_self', '_blank']

/** A tab opened with `target="_blank"` keeps a handle on the opener without this. */
function forceSafeRel(tagName: string, attribs: Record<string, string>) {
  if (attribs.target === '_blank') attribs.rel = 'noopener noreferrer'
  return { tagName, attribs }
}

function normalizeAnchor(tagName: string, attribs: Record<string, string>) {
  if (attribs.target !== undefined && !ALLOWED_TARGETS.includes(attribs.target)) delete attribs.target
  return forceSafeRel(tagName, attribs)
}

export function sanitizeEponymeRichText(html: string): string {
  return sanitizeHtml(html, POLICY)
}

/** Whether the policy removed anything - a tag, an attribute, a scheme - rather than merely reformatting. */
export function eponymeRichTextWasStripped(html: string): boolean {
  return sanitizeEponymeRichText(html) !== sanitizeHtml(html, PERMISSIVE)
}

const REJECTION = 'Contains HTML that is not allowed and was removed. Paste the content again as plain text.'

/** Names every rich text field of a payload that carried markup the policy had to remove. */
export function eponymeRichTextRejections(schema: EponymeSchema, data: Record<string, unknown>): ValidationErrors {
  const errors: ValidationErrors = {}
  mapEponymeRichText(schema, data, (html, path) => {
    if (eponymeRichTextWasStripped(html)) errors[path] = [REJECTION]
    return html
  })
  return errors
}
