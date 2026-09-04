import { describe, expect, it } from 'vitest'
import { field } from '../src/runtime/fields'
import type { EponymeSchema } from '../src/runtime/types'
import { eponymeRichTextContainer } from '../src/runtime/utils/rich-text-container'
import { eponymeRichTextWasStripped, sanitizeEponymeRichText } from '../src/runtime/utils/sanitize-rich-text'
import { interpolateEponymeEntryData } from '../src/runtime/utils/variables'

// Everything the dashboard's TipTap configuration can emit has to survive untouched, or the
// policy would refuse saves the editor itself produced.
const TIPTAP_OUTPUT = [
  '<p>Hello <strong>world</strong><br />next</p>',
  '<p></p>',
  '<h2>Title</h2><h3>Sub</h3>',
  '<ul><li><p>a</p></li></ul>',
  '<ol start="3"><li>a</li></ol>',
  '<blockquote><p>quote</p></blockquote>',
  '<pre><code class="language-js">const a = 1</code></pre>',
  '<p><code>x</code> <em>e</em> <s>s</s> <u>u</u></p>',
  '<hr />',
  '<p><a target="_blank" rel="noopener noreferrer" href="https://example.com">x</a></p>',
  '<p><a href="/interne">x</a> <a href="#anchor">y</a> <a href="mailto:a@b.c">z</a> <a href="tel:+33611131143">t</a></p>',
  '<p><a href="https://example.com/f.pdf" download>file</a></p>',
  '<img src="https://example.com/y.png" alt="a" title="t" class="eponyme-rich-text-image" />',
  '<p>a &amp; b &lt; c – é</p>',
  '<p>{{ currentYear }}</p>',
  '<table style="min-width:75px"><colgroup><col style="min-width:25px" /><col style="min-width:25px" /><col style="min-width:25px" /></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Head</p></th><td colspan="2" rowspan="1"><p>Cell</p></td></tr></tbody></table>',
  '<table style="min-width:50px"><tbody><tr><td colspan="1" rowspan="1" style="text-align:center"><p>x</p></td></tr></tbody></table>',
]

describe('rich text sanitisation', () => {
  it.each(TIPTAP_OUTPUT)('leaves editor output untouched: %s', (html) => {
    expect(sanitizeEponymeRichText(html)).toBe(html)
    expect(eponymeRichTextWasStripped(html)).toBe(false)
  })

  it.each([
    ['<p style="text-align: center">x</p>', '<p style="text-align:center">x</p>'],
    ['<h2 style="text-align: right">x</h2>', '<h2 style="text-align:right">x</h2>'],
    ['<h3 style="text-align: left">x</h3>', '<h3 style="text-align:left">x</h3>'],
    ['<p><span style="color: #ff41c5">x</span></p>', '<p><span style="color:#ff41c5">x</span></p>'],
    ['<p><span style="background-color: #e6b85c">x</span></p>', '<p><span style="background-color:#e6b85c">x</span></p>'],
    ['<p><span style="color: #ffffff; background-color: rgb(0, 0, 0)">x</span></p>', '<p><span style="color:#ffffff;background-color:rgb(0, 0, 0)">x</span></p>'],
  ])('keeps what the toolbar writes as inline style: %s', (html, stored) => {
    // The declaration is re-serialised without its space, which is a rewrite and not a
    // removal – so a save is never refused over it.
    expect(sanitizeEponymeRichText(html)).toBe(stored)
    expect(eponymeRichTextWasStripped(html)).toBe(false)
  })

  it.each([
    ['another declaration', '<p style="text-align: center; color: red">x</p>', '<p style="text-align:center">x</p>'],
    ['a layout escape', '<p style="position: fixed; top: 0">x</p>', '<p>x</p>'],
    ['a url value', '<p style="text-align: url(javascript:alert(1))">x</p>', '<p>x</p>'],
    // An alignment the toolbar cannot produce is not one the policy has to accept.
    ['an alignment the toolbar lacks', '<p style="text-align: justify">x</p>', '<p>x</p>'],
    // Allowing `style` on a paragraph must not open it anywhere else.
    ['a tag outside the list', '<blockquote style="text-align: center">x</blockquote>', '<blockquote>x</blockquote>'],
    // Allowing `style` on a span must not turn it into a free-form style attribute.
    ['a declaration the colour menus lack', '<p><span style="color: #fff; font-size: 40px">x</span></p>', '<p><span style="color:#fff">x</span></p>'],
    ['a colour that is not a colour', '<p><span style="color: url(javascript:alert(1))">x</span></p>', '<p><span>x</span></p>'],
  ])('drops %s', (_, html, expected) => {
    expect(sanitizeEponymeRichText(html)).toBe(expected)
  })

  it.each([
    ['a handler on a table', '<table onclick="steal()"><tbody><tr><td>x</td></tr></tbody></table>'],
    ['a width that is not a width', '<table style="min-width:expression(x)"><tbody><tr><td>x</td></tr></tbody></table>'],
    ['a cell alignment the extension cannot produce', '<table><tbody><tr><td style="text-align:justify">x</td></tr></tbody></table>'],
    ['a caption, which the toolbar has no way to add', '<table><caption>c</caption><tbody><tr><td>x</td></tr></tbody></table>'],
  ])('refuses %s inside a table', (_, html) => {
    expect(eponymeRichTextWasStripped(html)).toBe(true)
  })

  it.each(['_top', '_parent', 'evil'])('refuses target=%s, which reaches the framing document', (target) => {
    const html = `<p><a href="https://example.com" target="${target}">x</a></p>`
    expect(sanitizeEponymeRichText(html)).toBe('<p><a href="https://example.com">x</a></p>')
    // Removed rather than rewritten, so a payload carrying one is refused instead of silently changed.
    expect(eponymeRichTextWasStripped(html)).toBe(true)
  })

  it.each(['_self', '_blank'])('keeps target=%s, which the editor writes', (target) => {
    expect(eponymeRichTextWasStripped(`<p><a href="https://example.com" target="${target}">x</a></p>`)).toBe(false)
  })

  it('accepts the empty download attribute the link extension writes', () => {
    expect(sanitizeEponymeRichText('<a href="https://example.com/f.pdf" download="">f</a>'))
      .toBe('<a href="https://example.com/f.pdf" download>f</a>')
    expect(eponymeRichTextWasStripped('<a href="https://example.com/f.pdf" download="">f</a>')).toBe(false)
  })

  it.each([
    ['a script tag', '<script>alert(1)</script><p>ok</p>', '<p>ok</p>'],
    ['an event attribute', '<p onclick="alert(1)">x</p>', '<p>x</p>'],
    ['an image error handler', '<img src="https://e/x.png" onerror="alert(1)" />', '<img src="https://e/x.png" />'],
    ['a javascript: link', '<a href="javascript:alert(1)">x</a>', '<a>x</a>'],
    ['a data: image', '<img src="data:text/html;base64,PHNjcmlwdD4=" />', '<img />'],
    ['a protocol-relative link', '<a href="//evil.example">x</a>', '<a>x</a>'],
    ['an iframe', '<iframe src="https://evil.example"></iframe>', ''],
    ['object and embed', '<object data="x"></object><embed src="y" />', ''],
    ['active svg', '<svg><animate onbegin="alert(1)" /></svg>', ''],
    ['arbitrary styles', '<p style="position:fixed;inset:0">x</p>', '<p>x</p>'],
    ['a foreign class', '<p class="MsoNormal">x</p>', '<p>x</p>'],
    ['a heading the editor cannot make', '<h1>x</h1>', 'x'],
  ])('strips %s', (_label, html, expected) => {
    expect(sanitizeEponymeRichText(html)).toBe(expected)
    expect(eponymeRichTextWasStripped(html)).toBe(true)
  })

  it('forces rel on a link opening a new tab, without calling it a removal', () => {
    const html = '<a href="https://example.com" target="_blank">x</a>'
    expect(sanitizeEponymeRichText(html)).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>')
    expect(eponymeRichTextWasStripped(html)).toBe(false)
  })
})

describe('variables resolved into rich text', () => {
  const schema = {
    body: field.richText(),
    title: field.string(),
    intro: field.section({ fields: { lead: field.richText() } }),
  } satisfies EponymeSchema
  // A host can compute a variable from data it does not control, so its value is text.
  const variables = { brand: '<img src=x onerror="alert(1)">', year: '2026', amp: 'Ben & Co' }

  it('escapes a variable substituted into rich text', () => {
    expect(interpolateEponymeEntryData(schema, { body: '<p>{{ brand }}</p>' }, variables))
      .toEqual({ body: '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>' })
  })

  it('escapes it just as deeply as the schema nests it', () => {
    expect(interpolateEponymeEntryData(schema, { intro: { lead: '<p>{{ amp }}</p>' } }, variables))
      .toEqual({ intro: { lead: '<p>Ben &amp; Co</p>' } })
  })

  it('leaves plain text alone, where an ampersand is an ampersand', () => {
    expect(interpolateEponymeEntryData(schema, { title: '{{ amp }}' }, variables))
      .toEqual({ title: 'Ben & Co' })
  })

  it('resolves an ordinary variable in rich text without touching the markup around it', () => {
    expect(interpolateEponymeEntryData(schema, { body: '<p>Season <strong>{{ year }}</strong></p>' }, variables))
      .toEqual({ body: '<p>Season <strong>2026</strong></p>' })
  })

  it('falls back to the plain walk when no schema tells rich text apart', () => {
    expect(interpolateEponymeEntryData(undefined, { body: '<p>{{ amp }}</p>' }, variables))
      .toEqual({ body: '<p>Ben & Co</p>' })
  })
})

describe('EponymeRichText container', () => {
  it('renders the inert containers a page may ask for', () => {
    for (const tag of ['div', 'section', 'article', 'aside', 'main', 'span']) expect(eponymeRichTextContainer(tag)).toBe(tag)
  })

  it('falls back to a div rather than placing sanitized markup in an active context', () => {
    for (const tag of ['script', 'style', 'iframe', 'object']) expect(eponymeRichTextContainer(tag)).toBe('div')
  })
})
