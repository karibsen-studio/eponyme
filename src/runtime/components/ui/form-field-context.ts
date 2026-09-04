import type { InjectionKey } from 'vue'

/**
 * Lets a renderer tell the `EPFormField` instances below it how to present themselves - without every field
 * component having to declare and forward the same two props.
 */
export interface FormFieldContext {
  /** The parent already shows the label, so the field renders the control only. */
  hideLabel?: boolean
  /** Nested inside an array item: smaller label. */
  compact?: boolean
}

export const formFieldContextKey: InjectionKey<FormFieldContext> = Symbol('eponyme-form-field')
