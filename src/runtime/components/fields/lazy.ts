import { defineAsyncComponent } from 'vue'

/** Field components whose dependencies are too heavy to load for a schema that never uses them. */
export const LazyRichTextField = defineAsyncComponent(() => import('./RichTextField.vue'))
export const LazyArrayField = defineAsyncComponent(() => import('./ArrayField.vue'))
export const LazyMaskedInput = defineAsyncComponent(() => import('../ui/EPMaskedInput.vue'))
