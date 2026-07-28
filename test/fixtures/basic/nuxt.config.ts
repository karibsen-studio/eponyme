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
  },
  eponyme: {
    prismaClient: './server/utils/prisma',
    previewPaths: {
      'pages/homepage': '/',
      'articles': '/articles/:slug',
    },
  },
})
