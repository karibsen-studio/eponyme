import {
  addImports,
  addImportsDir,
  addRouteMiddleware,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  findPath,
  useLogger,
} from '@nuxt/kit'
import pc from 'picocolors'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// Re-exported so `import type { FieldDefinition } from '@karibsen/eponyme'` resolves.
// The runtime helpers (`field`, `collection`, `defineEponymeConfig`) live at
// `@karibsen/eponyme/config`, since the package root has to stay the Nuxt module itself.
export type * from './eponyme'

export interface ModuleOptions {
  dashboardPath?: string
  /** Public routes used for previews and sitemap entries. Collections use a `:slug` placeholder. */
  previewPaths?: Record<string, string>
  /** Path to a server module exporting an already initialized PrismaClient. */
  prismaClient: string
  /** Default palette offered by every color field; a field can override it with its own `presets`. */
  colorPresets?: Array<string | { label: string, value: string }>
  auth?: {
    /** Fixed lifetime of an authenticated session. */
    sessionDurationDays?: number
  }
  /**
   * How long a server instance may reuse content it has already read, in seconds.
   * A save clears what it changed on its own instance, so this only bounds how long
   * another instance can still serve the previous content. `0` disables the cache.
   */
  cacheSeconds?: number
  /**
   * How long a browser may reuse published content, in seconds. This is what makes a
   * client-side navigation instant, and it is the one window nobody can purge: a visitor
   * who already holds a copy keeps it until it expires. Keep it short. `0` disables it.
   */
  browserCacheSeconds?: number
  /**
   * How long a CDN may reuse published content, in seconds. A CDN can be purged — the
   * `eponyme:entry:published` hook is the place to do it — so this can be generous.
   * `0` disables it.
   */
  cdnCacheSeconds?: number
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@karibsen/eponyme',
    configKey: 'eponyme',
  },

  defaults: {
    dashboardPath: '/__eponyme',
    previewPaths: {},
    prismaClient: '',
    colorPresets: [],
    auth: {
      sessionDurationDays: 7,
    },
    cacheSeconds: 5,
    browserCacheSeconds: 30,
    cdnCacheSeconds: 300,
  },

  moduleDependencies: {
    '@nuxt/icon': {
      overrides: {
        serverBundle: { collections: ['mingcute'] },
        clientBundle: {
          icons: [
            'mingcute:history-anticlockwise-line',
            'mingcute:eye-2-line',
            'mingcute:layout-leftbar-close-line',
            'mingcute:layout-leftbar-open-line',
            'mingcute:down-small-line',
            'mingcute:search-line',
            'mingcute:close-line',
            'mingcute:arrow-right-line',
            'mingcute:align-arrow-right-line',
            'mingcute:link-2-line',
            'mingcute:settings-3-line',
            'mingcute:code-line',
            'mingcute:refresh-2-line',
            'mingcute:external-link-line',
            'mingcute:paragraph-line',
            'mingcute:heading-2-line',
            'mingcute:heading-3-line',
            'mingcute:bold-line',
            'mingcute:italic-line',
            'mingcute:strikethrough-line',
            'mingcute:link-line',
            'mingcute:pic-line',
            'mingcute:list-check-line',
            'mingcute:list-ordered-line',
            'mingcute:quote-left-line',
            'mingcute:back-2-line',
            'mingcute:forward-2-line',
            'mingcute:download-2-line',
            'mingcute:upload-2-line',
          ],
        },
      },
    },
  },

  async setup(options, nuxt) {
    const logger = useLogger('eponyme')
    const resolver = createResolver(import.meta.url)
    const dashboardPath = `/${(options.dashboardPath || '__eponyme').replace(/^\/+|\/+$/g, '')}`
    const publicRuntimeConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>
    publicRuntimeConfig.eponyme = {
      previewPaths: options.previewPaths ?? {},
      dashboardPath,
      colorPresets: options.colorPresets ?? [],
    }
    nuxt.options.runtimeConfig.eponymeAuth = {
      sessionDurationDays: options.auth?.sessionDurationDays ?? 7,
    }
    nuxt.options.runtimeConfig.eponymeContent = {
      cacheSeconds: options.cacheSeconds ?? 5,
      browserCacheSeconds: options.browserCacheSeconds ?? 30,
      cdnCacheSeconds: options.cdnCacheSeconds ?? 300,
    }

    // `nuxt prepare` also runs on the module's own repository, where there is no host app
    // to configure — the requirements below only make sense when actually serving.
    const preparing = Boolean(nuxt.options._prepare)

    if (!options.prismaClient) {
      if (!preparing) throw new Error(`${pc.red('[Eponyme]')} eponyme.prismaClient is required.`)
      logger.info('No prismaClient configured, skipping wiring (prepare).')
      return
    }

    // Each alias keeps the meaning Nuxt gives it. The distinction matters: in Nuxt 4
    // `~/` is `app/`, so a server module is reached with `~~/server/…`, not `~/server/…`.
    const prismaSpecifier = options.prismaClient
      .replace(/^[~@]{2}\//, `${nuxt.options.rootDir}/`)
      .replace(/^[~@]\//, `${nuxt.options.srcDir}/`)
    const prismaPath = await findPath(resolve(nuxt.options.rootDir, prismaSpecifier))
    if (!prismaPath) {
      throw new Error(
        `${pc.red('[Eponyme]')} Prisma client module not found: ${options.prismaClient}\n`
        + `Expected a module exporting a PrismaClient as its default export, for example '~~/server/utils/prisma'.\n`
        + `Note that '~/' points at ${nuxt.options.srcDir}, so a server module needs '~~/'.`,
      )
    }

    addImports([
      { name: 'defineEponymeConfig', from: resolver.resolve('./config/config') },
      { name: 'collection', from: resolver.resolve('./config/collection') },
      { name: 'form', from: resolver.resolve('./config/form') },
      { name: 'defineEponymeVariables', from: resolver.resolve('./config/variables') },
      { name: 'field', from: resolver.resolve('./runtime/fields') },
      { name: 'today', from: resolver.resolve('./runtime/fields') },
    ])
    addImportsDir(resolver.resolve('./runtime/composables'))
    addServerImports([
      { name: 'getEponymeSitemapEntries', from: resolver.resolve('./runtime/server/utils/eponyme-sitemap') },
      // A `custom` form posts to the host application's own route, so this is what
      // keeps server-side validation as the security boundary.
      { name: 'validateEponymeForm', from: resolver.resolve('./runtime/server/utils/eponyme-form') },
      // The tags a CDN purge has to invalidate when an entry changes, matching exactly what
      // the cached responses were tagged with.
      { name: 'getEponymeCacheTags', from: resolver.resolve('./runtime/server/utils/eponyme-cache') },
    ])
    addRouteMiddleware({
      name: 'eponyme-auth',
      path: resolver.resolve('./runtime/middleware/eponyme-auth'),
    })
    addRouteMiddleware({
      name: 'eponyme-owner',
      path: resolver.resolve('./runtime/middleware/eponyme-owner'),
    })
    // reka-ui ships client-compiled render functions that call `renderSlot`. Left
    // external, they resolve their own CJS copy of Vue, whose
    // `currentRenderingInstance` is always null during SSR — the dashboard then
    // crashes in production builds only. Transpiling keeps one copy of Vue.
    nuxt.options.build.transpile.push('reka-ui')
    // `slugify` and `sortablejs` are CommonJS-only. Vite pre-bundles dependencies it
    // discovers in the host's own node_modules, but not those reached through this
    // module, so their default export goes missing in dev unless they are declared.
    nuxt.options.vite.optimizeDeps ??= {}
    nuxt.options.vite.optimizeDeps.include = [
      ...(nuxt.options.vite.optimizeDeps.include ?? []),
      'slugify',
      'sortablejs',
    ]
    nuxt.options.css.push(resolver.resolve('./runtime/assets/dashboard.css'))
    nuxt.hook('vite:extendConfig', (viteConfig) => {
      const plugins = viteConfig.plugins as unknown as Array<unknown> | undefined
      plugins?.push(tailwindcss())
    })

    const configPath = await findPath(resolve(nuxt.options.rootDir, 'eponyme.config.ts'))
    if (!configPath) {
      if (!preparing) throw new Error(`${pc.red('[Eponyme]')} eponyme.config.ts not found at the project root.`)
      logger.info('No eponyme.config.ts found, skipping wiring (prepare).')
      return
    }

    nuxt.options.alias['#eponyme/config'] = configPath
    nuxt.options.alias['#eponyme/prisma'] = prismaPath

    // Optional, and aliased rather than read here: variables may be functions, which
    // runtimeConfig cannot carry across the serialization boundary.
    const variablesPath = await findPath(resolve(nuxt.options.rootDir, 'eponyme.variables.ts'))
    nuxt.options.alias['#eponyme/variables'] = variablesPath ?? resolver.resolve('./runtime/utils/empty-variables')

    // A captcha adapter module overrides this alias in its own setup. Left alone, the
    // stand-in refuses every token, so a form requiring a captcha fails closed.
    nuxt.options.alias['#eponyme/captcha'] ??= resolver.resolve('./runtime/utils/no-captcha')

    addTypeTemplate({
      filename: 'types/eponyme-config.d.ts',
      getContents: () => `declare module '#eponyme/config' {\n  const config: typeof import(${JSON.stringify(configPath)})['default']\n  export default config\n}\n`
        + `declare module '#eponyme/variables' {\n  const variables: typeof import(${JSON.stringify(nuxt.options.alias['#eponyme/variables'])})['default']\n  export default variables\n}\n`
        + `declare module '#eponyme/captcha' {\n  const verifier: import('${resolver.resolve('./runtime/types/captcha')}').EponymeCaptchaVerifier\n  export default verifier\n}\n`,
    })

    // Registered before the routes: it marks every Eponyme response uncacheable, and the
    // few that may be cached override it themselves.
    addServerHandler({ middleware: true, handler: resolver.resolve('./runtime/server/middleware/eponyme-no-store') })
    addServerHandler({ route: '/api/eponyme/**', handler: resolver.resolve('./runtime/server/api/eponyme/[name].get') })
    addServerHandler({ route: '/api/eponyme/**', method: 'patch', handler: resolver.resolve('./runtime/server/api/eponyme/[name].patch') })
    addServerHandler({ route: '/api/eponyme-statuses', handler: resolver.resolve('./runtime/server/api/eponyme-statuses.get') })
    addServerHandler({ route: '/api/eponyme-sitemap', handler: resolver.resolve('./runtime/server/api/eponyme-sitemap.get') })
    addServerHandler({ route: '/api/eponyme-export', handler: resolver.resolve('./runtime/server/api/eponyme-export.get') })
    addServerHandler({ route: '/api/eponyme-import', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-import.post') })
    addServerHandler({ route: '/api/eponyme-history/**', handler: resolver.resolve('./runtime/server/api/eponyme-history/[path].get') })
    addServerHandler({ route: '/api/eponyme-history/**', method: 'patch', handler: resolver.resolve('./runtime/server/api/eponyme-history/[path].patch') })
    addServerHandler({ route: '/api/eponyme-collections/**', handler: resolver.resolve('./runtime/server/api/eponyme-collections/[path].get') })
    addServerHandler({ route: '/api/eponyme-collections/**', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-collections/[path].post') })
    addServerHandler({ route: '/api/eponyme-collections/**', method: 'delete', handler: resolver.resolve('./runtime/server/api/eponyme-collections/[path].delete') })
    addServerHandler({ route: '/api/eponyme-trash/**', handler: resolver.resolve('./runtime/server/api/eponyme-trash/[path].get') })
    addServerHandler({ route: '/api/eponyme-trash/**', method: 'patch', handler: resolver.resolve('./runtime/server/api/eponyme-trash/[path].patch') })
    addServerHandler({ route: '/api/eponyme-trash/**', method: 'delete', handler: resolver.resolve('./runtime/server/api/eponyme-trash/[path].delete') })
    addServerHandler({ route: '/api/eponyme-forms/**', handler: resolver.resolve('./runtime/server/api/eponyme-forms/[path].get') })
    addServerHandler({ route: '/api/eponyme-forms/**', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-forms/[path].post') })
    addServerHandler({ route: '/api/eponyme-forms/**', method: 'delete', handler: resolver.resolve('./runtime/server/api/eponyme-forms/[path].delete') })
    addServerHandler({ route: '/api/eponyme-auth/session', handler: resolver.resolve('./runtime/server/api/eponyme-auth/session.get') })
    addServerHandler({ route: '/api/eponyme-auth/login', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-auth/login.post') })
    addServerHandler({ route: '/api/eponyme-auth/logout', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-auth/logout.post') })
    addServerHandler({ route: '/api/eponyme-auth/change-password', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-auth/change-password.post') })
    addServerHandler({ route: '/api/eponyme-users', handler: resolver.resolve('./runtime/server/api/eponyme-users/index.get') })
    addServerHandler({ route: '/api/eponyme-users', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-users/index.post') })
    addServerHandler({ route: '/api/eponyme-users/:id', method: 'patch', handler: resolver.resolve('./runtime/server/api/eponyme-users/[id].patch') })
    addServerHandler({ route: '/api/eponyme-users/:id/reset-password', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-users/[id]/reset-password.post') })
    addServerPlugin(resolver.resolve('./runtime/server/plugins/eponyme-sync'))

    nuxt.hook('pages:extend', (pages) => {
      pages.push(
        { name: 'eponyme-login', path: `${dashboardPath}/login`, file: resolver.resolve('./runtime/pages/EponymeLoginPage.vue'), meta: { layout: false } },
        { name: 'eponyme-change-password', path: `${dashboardPath}/change-password`, file: resolver.resolve('./runtime/pages/EponymeChangePasswordPage.vue'), meta: { layout: false, middleware: ['eponyme-auth'] } },
        { name: 'eponyme-users', path: `${dashboardPath}/users`, file: resolver.resolve('./runtime/pages/EponymeUsersPage.vue'), meta: { layout: false, middleware: ['eponyme-auth', 'eponyme-owner'] } },
        { name: 'eponyme-index', path: dashboardPath, file: resolver.resolve('./runtime/pages/EponymeIndexPage.vue'), meta: { layout: false, middleware: ['eponyme-auth'] } },
        { name: 'eponyme-detail', path: `${dashboardPath}/:eponyme(.*)*`, file: resolver.resolve('./runtime/pages/EponymeDetailPage.vue'), meta: { layout: false, middleware: ['eponyme-auth'] } },
      )
    })

    logger.debug(`config loaded: ${configPath}`)
  },
})
