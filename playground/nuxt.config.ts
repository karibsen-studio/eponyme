import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },
  rootDir: fileURLToPath(new URL('.', import.meta.url)),
  compatibilityDate: 'latest',
  eponyme: {
    prismaClient: './server/utils/prisma',
    previewPaths: {
      'pages/test/Homepage': '/',
      'articles': '/articles/:slug',
    },
    colorPresets: [
      { label: 'Ink', value: '#171714' },
      { label: 'Sand', value: '#e7e0d4' },
      { label: 'Clay', value: '#b4654a' },
      { label: 'Moss', value: '#5c6f52' },
      '#ffffff',
    ],
  },
})
