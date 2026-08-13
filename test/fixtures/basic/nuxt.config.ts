import Eponyme from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    Eponyme,
  ],
  // Un build de test minifié ne renvoie que des noms de propriétés illisibles :
  // sans ça, une erreur SSR ressort en « Cannot read properties of null (reading 'ce') ».
  sourcemap: { server: true },
  nitro: {
    minify: false,
    sourceMap: true,
    // Exercises the shared-cache wiring for real — mount resolution, key prefixing and
    // invalidation all go through Nitro rather than through a stub. The memory driver keeps
    // the tests dependency-free; Redis differs only in where the same calls land.
    storage: {
      eponyme: { driver: 'memory' },
    },
  },
  eponyme: {
    prismaClient: './server/utils/prisma',
    cacheStorage: 'eponyme',
    // Integration tests intentionally submit more forms than a real visitor should in one minute.
    // `formPerIp` is the exception: it stays low enough that a test can actually reach it, since
    // a limit nothing ever trips is a limit nothing proves. A window is per form name, and the
    // busiest form here submits 11 times, so this leaves room — raise it if that ever grows.
    rateLimits: { loginPerIp: 1000, loginGlobal: 1000, loginAccountFailures: 1000, formPerIp: 20, formGlobal: 1000 },
    previewPaths: {
      'pages/homepage': '/',
      'articles': '/articles/:slug',
    },
    publication: { 'pages/frozen': false },
  },
})
