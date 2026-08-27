import { defineComponent, h } from 'vue'

/**
 * Renders a `field.richText()` value on a public page.
 *
 * The HTML is safe by construction rather than by inspection here: every write path runs it
 * through Eponyme's sanitisation policy before it is stored, and a payload carrying anything
 * the editor cannot produce is refused with a `422`. Re-sanitising in the browser would ship
 * a parser to every visitor to re-check a decision the server already made – and a client
 * that can be skipped is not a security boundary anyway.
 *
 * It exists so a host application never writes `v-html` itself, which is the line between
 * "Eponyme guarantees this" and "the application hopes so".
 *
 * A render function rather than a template: `innerHTML` is what `v-html` compiles to, and
 * writing it directly keeps the one deliberate injection point in a file that explains it.
 */
export default defineComponent({
  name: 'EponymeRichText',
  props: {
    html: { type: String, default: '' },
    as: { type: String, default: 'div' },
  },
  setup(props) {
    return () => h(props.as, { class: 'eponyme-rich-text', innerHTML: props.html })
  },
})
