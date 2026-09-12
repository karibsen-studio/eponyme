import { inject } from 'vue'
import type { ComputedRef, InjectionKey } from 'vue'

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

/**
 * Ids of the description and error `EPFormField` renders. The control itself must point at them: an
 * association carried by a wrapper is not read out when the control takes focus.
 */
export const formFieldDescribedByKey: InjectionKey<ComputedRef<string | undefined>> = Symbol('eponyme-form-field-described-by')

/** Read by every control that renders inside an `EPFormField` slot. */
export function useFormFieldDescribedBy(): ComputedRef<string | undefined> | undefined {
  return inject(formFieldDescribedByKey, undefined)
}
