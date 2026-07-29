/** A variable resolves to a fixed value, or is computed on every read. */
export type EponymeVariableValue = string | number | (() => string | number)

export interface EponymeVariableDefinition {
  /** Shown in the editor's variable menu. Defaults to the variable name. */
  label?: string
  description?: string
  value: EponymeVariableValue
}

export type EponymeVariables = Record<string, EponymeVariableValue | EponymeVariableDefinition>

/** What the editor needs to list a variable without being able to resolve it. */
export interface EponymeVariableSummary {
  name: string
  label: string
  description?: string
  /** Value at build time, shown as an example in the menu. */
  preview: string
}
