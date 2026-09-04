import { computed, defineComponent, h } from 'vue'
import { eponymeRichTextContainer, isEponymeRichTextContainer } from '../utils/rich-text-container'

/** Renders a `field.richText()` value on a public page. */
export default defineComponent({
  name: 'EponymeRichText',
  props: {
    html: { type: String, default: '' },
    as: { type: String, default: 'div', validator: isEponymeRichTextContainer },
  },
  setup(props) {
    const tag = computed(() => eponymeRichTextContainer(props.as))
    return () => h(tag.value, { class: 'eponyme-rich-text', innerHTML: props.html })
  },
})
