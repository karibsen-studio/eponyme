import { defineAsyncComponent } from 'vue'

/**
 * Field components whose dependencies are too heavy to load for a schema that never uses them.
 *
 * `RichTextField` carries TipTap and ProseMirror, about half of the editor's JavaScript, and
 * `ArrayField` carries `sortablejs` through `useSortable`. Both were imported statically, so a
 * schema of nothing but text fields downloaded an editor and a drag-and-drop engine it had no
 * use for. `EPMaskedInput` carries `maska` and is reached from `TextField`, which every schema
 * renders — so a static import there would ship the masking engine to schemas with no mask.
 *
 * Declared here, once, rather than inline at each call site. `defineAsyncComponent` returns a
 * new wrapper on every call, and a wrapper whose identity changes makes Vue unmount and remount
 * the component underneath it — which for the rich text field means losing the caret mid-word.
 * `ArrayField` is rendered from three places, so a shared wrapper also keeps them on one chunk
 * instead of three.
 *
 * Server rendering is unaffected: Vue awaits an async component before rendering it, so the
 * HTML is what it always was. Only the browser's first paint changes, and only for a field
 * that appears after hydration.
 */
export const LazyRichTextField = defineAsyncComponent(() => import('./RichTextField.vue'))
export const LazyArrayField = defineAsyncComponent(() => import('./ArrayField.vue'))
export const LazyMaskedInput = defineAsyncComponent(() => import('../ui/EPMaskedInput.vue'))
