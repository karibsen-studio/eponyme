declare module '#eponyme/custom-fields' {
  // Filled by the type template generated from eponyme/fields.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface EponymeCustomFieldRegistry {}
  export const eponymeCustomFields: EponymeCustomFieldRegistry
}

declare module '#eponyme/custom-field-components' {
  import type { Component } from 'vue'

  export const eponymeCustomFieldComponents: Readonly<Record<string, Component>>
}
