import { useRequestFetch } from '#app'
import type { FetchError } from 'ofetch'
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type eponymeConfig from '#eponyme/config'
import type { EponymeFormDataByName, EponymeFormDefinitionBase, EponymeFormFieldDefinition, EponymeFormName } from '../types'
import { createDefaultEponymeData } from '../utils/create-default-eponyme-data'
import { getEponymeForms } from '../utils/get-eponyme-schemas'
import { humanizeLabel } from '../utils/humanize-label'
import type { ValidationErrors } from '../utils/validate-eponyme-data'
import { useEponymeConfig } from './useEponymeConfig'
import { useEponymeValidation } from './useEponymeValidation'

type ConfigFormName = EponymeFormName<typeof eponymeConfig>

function resolveForm(name: string): EponymeFormDefinitionBase {
  const definition = getEponymeForms(useEponymeConfig())[name] as EponymeFormDefinitionBase | undefined
  if (!definition) throw new Error(`[Eponyme] Unknown form "${name}". Declare it with form() in eponyme.config.ts.`)
  return definition
}

export interface UseEponymeFormField {
  name: string
  definition: EponymeFormFieldDefinition
  label: string
  required: boolean
  value: unknown
  errors: string[]
  update: (value: unknown) => void
}

export interface UseEponymeFormOptions<Data extends Record<string, unknown>> {
  /** Required for a `custom` form: receives the validated data. */
  onSubmit?: (data: Data) => unknown | Promise<unknown>
}

export interface UseEponymeFormResult<Data extends Record<string, unknown>> {
  fields: ComputedRef<UseEponymeFormField[]>
  values: Ref<Data>
  errors: ComputedRef<ValidationErrors>
  pending: Ref<boolean>
  submitted: Ref<boolean>
  /** Name of the trap field to render hidden, or `false` when disabled. */
  honeypot: string | false
  submit: () => Promise<boolean>
  reset: () => void
}

/**
 * Renders nothing: the host application owns the markup, so a public page never
 * inherits the dashboard's styling or its editor dependencies.
 */
export function useEponymeForm<const Name extends ConfigFormName>(
  name: Name,
  options: UseEponymeFormOptions<EponymeFormDataByName<typeof eponymeConfig, Name>> = {},
): UseEponymeFormResult<EponymeFormDataByName<typeof eponymeConfig, Name>> {
  const definition = resolveForm(name)

  const requestFetch = useRequestFetch()
  const serverErrors = ref<ValidationErrors>({})
  const pending = ref(false)
  const submitted = ref(false)
  const values = ref<Record<string, unknown>>(createDefaultEponymeData(definition.fields) as Record<string, unknown>)
  // A public form has no previously saved state, so every edited field counts as
  // touched and its message shows as soon as it becomes invalid.
  const validation = useEponymeValidation(definition.fields, values, ref({}), { serverErrors })

  const fields = computed<UseEponymeFormField[]>(() => Object.entries(definition.fields).map(([fieldName, fieldDefinition]) => ({
    name: fieldName,
    definition: fieldDefinition as EponymeFormFieldDefinition,
    label: humanizeLabel(fieldName, fieldDefinition.options.label),
    required: Boolean(fieldDefinition.options.required),
    value: values.value[fieldName],
    errors: validation.errors.value[fieldName] ?? [],
    update: (value: unknown) => {
      values.value = { ...values.value, [fieldName]: value }
    },
  })))

  function reset() {
    values.value = createDefaultEponymeData(definition.fields) as Record<string, unknown>
    serverErrors.value = {}
    submitted.value = false
    validation.reset()
  }

  async function submit(): Promise<boolean> {
    serverErrors.value = {}
    if (!validation.validateForPublish()) return false

    pending.value = true
    try {
      // The configured mode decides, not the presence of a callback, so the
      // behaviour stays readable from eponyme.config.ts alone.
      if (definition.submission.mode === 'custom') {
        if (!options.onSubmit)
          throw new Error(`[Eponyme] Form "${name}" uses the custom submission mode and needs an onSubmit handler. Switch it to submission: { mode: 'managed' } to let Eponyme store it instead.`)
        await options.onSubmit(values.value as EponymeFormDataByName<typeof eponymeConfig, Name>)
      }
      else {
        if (options.onSubmit && import.meta.dev)
          console.warn(`[Eponyme] Form "${name}" is managed, so its onSubmit handler is ignored.`)
        // The wildcard route is not in Nitro's generated route map, so its method
        // cannot be inferred from the literal path.
        await requestFetch(`/api/eponyme-forms/${name}` as string, { method: 'POST', body: values.value })
      }
      submitted.value = true
      return true
    }
    catch (error) {
      const fetchError = error as FetchError<{ errors?: ValidationErrors }>
      if (fetchError.statusCode === 422) {
        serverErrors.value = fetchError.data?.errors ?? {}
        return false
      }
      throw error
    }
    finally {
      pending.value = false
    }
  }

  return {
    fields,
    values: values as Ref<EponymeFormDataByName<typeof eponymeConfig, Name>>,
    errors: validation.errors,
    pending,
    submitted,
    honeypot: definition.honeypot,
    submit,
    reset,
  }
}
