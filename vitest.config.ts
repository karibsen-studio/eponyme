import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The e2e suite boots a real Nuxt build, which routinely exceeds the 5s default in CI.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      include: ['src/**'],
      exclude: ['src/runtime/components/**', 'src/runtime/pages/**'],
    },
  },
})
