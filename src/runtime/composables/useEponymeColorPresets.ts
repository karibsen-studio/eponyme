import { useRuntimeConfig } from '#app'
import type { ColorPreset } from '../types'
import { humanizeLabel } from '../utils/humanize-label'
import { normalizeHexColor } from '../utils/normalize-hex-color'

/** Accepts both `'#171714'` and `{ label, value }`, and drops anything that is not a colour. */
export function normalizeColorPresets(presets: ReadonlyArray<string | ColorPreset> | undefined): ColorPreset[] {
  return (presets ?? []).flatMap((preset) => {
    const value = typeof preset === 'string' ? preset : preset.value
    if (!normalizeHexColor(value)) return []
    const label = typeof preset === 'string' ? humanizeLabel(value) : preset.label
    return [{ label, value }]
  })
}

/** Palette declared once in `nuxt.config.ts` under `eponyme.colorPresets`. */
export function useEponymeColorPresets(): ColorPreset[] {
  const runtimeConfig = useRuntimeConfig()
  const eponyme = runtimeConfig.public.eponyme as { colorPresets?: Array<string | ColorPreset> } | undefined
  return normalizeColorPresets(eponyme?.colorPresets)
}
