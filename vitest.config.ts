import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#eponyme/locale': fileURLToPath(new URL('./src/runtime/locales/fallback.ts', import.meta.url)),
      '#eponyme/custom-fields': fileURLToPath(new URL('./src/runtime/utils/empty-custom-fields.ts', import.meta.url)),
      '#eponyme/custom-field-components': fileURLToPath(new URL('./src/runtime/utils/empty-custom-field-components.ts', import.meta.url)),
      '#eponyme/phone': fileURLToPath(new URL('./src/runtime/utils/normalize-phone.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      include: ['src/**'],
      exclude: ['src/runtime/components/**', 'src/runtime/pages/**'],
    },
  },
})
