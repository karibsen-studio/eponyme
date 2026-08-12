import { useState } from '#app'
import type { EponymeTheme } from '../utils/eponyme-theme'

export function useEponymeTheme() {
  const theme = useState<EponymeTheme | undefined>('eponyme:theme', () => undefined)

  function setTheme(value: EponymeTheme) {
    theme.value = value
  }

  return {
    theme,
    setTheme,
  }
}
