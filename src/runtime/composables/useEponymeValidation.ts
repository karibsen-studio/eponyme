import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import type { EponymeSchema } from '../types'
import { buildEponymeSchema, zodErrorToValidationErrors } from '../utils/build-eponyme-schema'
import type { ValidationErrors, ValidationMode } from '../utils/validate-eponyme-data'
import { changedPaths } from '../utils/changed-paths'

const DEBOUNCE_MS = 300

export interface UseEponymeValidationOptions {
  /** Errors reported by the server, always shown regardless of what the user touched. */
  serverErrors?: Ref<ValidationErrors>
}

/**
 * Validates the edited document while the user types, using the same schema the server
 * enforces on write. Only the fields the user actually changed are flagged, so opening an
 * entry with incomplete content does not paint it red — until a publish attempt fails, at
 * which point everything is revealed.
 */
export function useEponymeValidation(
  schema: EponymeSchema,
  data: Ref<Record<string, unknown>>,
  savedData: Ref<Record<string, unknown>>,
  options: UseEponymeValidationOptions = {},
) {
  const liveErrors = ref<ValidationErrors>({})
  const showAll = ref(false)

  function validateNow(mode: ValidationMode = 'draft') {
    const result = buildEponymeSchema(schema, mode).safeParse(data.value)
    liveErrors.value = result.success ? {} : zodErrorToValidationErrors(result.error)
    return liveErrors.value
  }

  const validateDebounced = useDebounceFn(() => validateNow('draft'), DEBOUNCE_MS)

  watch(data, () => void validateDebounced(), { deep: true })

  // A field counts as touched once its value differs from what was loaded or last saved.
  const touched = computed(() => new Set(changedPaths(data.value, savedData.value)))

  const errors = computed<ValidationErrors>(() => {
    const merged: ValidationErrors = { ...options.serverErrors?.value }
    for (const [path, messages] of Object.entries(liveErrors.value)) {
      if (!showAll.value && !touched.value.has(path)) continue
      merged[path] = [...new Set([...(merged[path] ?? []), ...messages])]
    }
    return merged
  })

  /** Runs the full publish-time rules and reveals every message; returns true when valid. */
  function validateForPublish() {
    showAll.value = true
    return Object.keys(validateNow('publish')).length === 0
  }

  /** Called after a successful save: what was just persisted is no longer "touched". */
  function reset() {
    showAll.value = false
    liveErrors.value = {}
  }

  return { errors, touched, showAll, validateNow, validateForPublish, reset }
}
