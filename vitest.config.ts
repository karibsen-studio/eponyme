import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#eponyme/locale': fileURLToPath(new URL('./src/runtime/locales/fallback.ts', import.meta.url)),
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
