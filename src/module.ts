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
  getNuxtModuleVersion,
  hasNuxtModule,
  hasNuxtModuleCompatibility,
  useLogger,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import pc from 'picocolors'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { tagPreviewPathRoutes } from './runtime/utils/cache-tags'

// Re-exported so `import type { FieldDefinition } from '@karibsen/eponyme'` resolves.
// The runtime helpers (`field`, `collection`, `defineEponymeConfig`) live at
// `@karibsen/eponyme/config`, since the package root has to stay the Nuxt module itself.
export type * from './eponyme'

/**
 * Options read from the `eponyme` key of `nuxt.config`.
 *
 * @example
 * ```ts
 * export default defineNuxtConfig({
 *   modules: ['@karibsen/eponyme'],
 *   eponyme: {
 *     prismaClient: '~~/server/utils/prisma',
 *     previewPaths: {
 *       homepage: '/',
 *       articles: '/articles/:slug',
 *     },
 *   },
 * })
 * ```
 */
export interface ModuleOptions {
  /**
   * Route the dashboard is served on. Surrounding slashes are normalised, so `__eponyme` and
   * `/__eponyme/` are equivalent.
   *
   * @default "/__eponyme"
   */
  dashboardPath?: string

  /**
   * Public route rendering each entry, keyed by singleton name or by collection name. A
   * collection value must contain `:slug`, which is replaced by the entry slug.
   *
   * @remarks
   * An entry left out of this map has no preview, no sitemap entry, and no cache tag on the page
   * that renders it.
   *
   * @default {}
   * @example
   * ```ts
   * previewPaths: {
   *   homepage: '/',
   *   articles: '/articles/:slug',
   * }
   * ```
   */
  previewPaths?: Record<string, string>

  /**
   * Module specifier of a server file whose default export is an initialised `PrismaClient`.
   * Nuxt aliases apply, and keep their usual meaning: a server file lives under `~~/`, not `~/`.
   *
   * @example
   * ```ts
   * prismaClient: '~~/server/utils/prisma'
   * ```
   * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/introduction
   */
  prismaClient: string

  /**
   * Palette offered by every color field, which a field overrides with its own `presets`.
   *
   * @remarks
   * A bare string is labelled from its value. An entry that is not a valid hex colour is dropped.
   *
   * @default []
   * @example
   * ```ts
   * colorPresets: [
   *   { label: 'Ink', value: '#171714' },
   *   '#ffffff',
   * ]
   * ```
   */
  colorPresets?: Array<string | { label: string, value: string }>

  auth?: {
    /**
     * Lifetime of an authenticated session, in days, counted from sign-in and never extended by
     * activity.
     *
     * @default 7
     */
    sessionDurationDays?: number
  }

  /**
   * How long a server instance may reuse content it has already read, in seconds. `0` disables it.
   *
   * @remarks
   * A save only clears the instance that served it, so this bounds how long another instance can
   * still answer with the previous content.
   *
   * @default 5
   */
  cacheSeconds?: number

  /**
   * How long a browser may reuse published content, in seconds. `0` disables it.
   *
   * @remarks
   * A browser cache cannot be purged: a visitor holding a copy keeps it until it expires, whatever
   * is published meanwhile.
   *
   * @default 30
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
   */
  browserCacheSeconds?: number

  /**
   * How long a CDN may reuse published content, in seconds. `0` disables it.
   *
   * @remarks
   * Sent as `s-maxage`, with `stale-while-revalidate` twelve times longer. Cached responses carry
   * cache tags, so a publication can purge them from the `eponyme:entry:published` hook.
   *
   * @default 300
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
   */
  cdnCacheSeconds?: number
}

/** The oldest `@nuxt/ui` whose Tailwind the dashboard's styles compile against. */
const MINIMUM_NUXT_UI = '4.10.0'

/**
 * `@nuxt/ui` is not a dependency — the dashboard brings its own components. But both ship
 * Tailwind, and an older `@nuxt/ui` resolves a version this module was not built against.
 * Said out loud at build time because the consequences are diffuse: broken dashboard styles
 * are only the visible case, and nothing else would point back here.
 *
 * Deliberately not a `peerDependencies` entry. Declaring it makes pnpm install `@nuxt/ui`
 * into this repository and rewrite around 1150 lines of the lockfile, changing resolutions
 * for unrelated packages — a large risk of breaking something unforeseen, in exchange for an
 * install-time warning this message already covers.
 *
 * A warning, not a refusal: an application that pinned its own Tailwind may well work, and
 * this module has no business stopping a build over a version it only shares by accident.
 */
async function warnOnIncompatibleNuxtUi(nuxt: Nuxt, logger: ReturnType<typeof useLogger>) {
  if (!hasNuxtModule('@nuxt/ui', nuxt)) return
  if (await hasNuxtModuleCompatibility('@nuxt/ui', `>=${MINIMUM_NUXT_UI}`, nuxt)) return
  const found = await getNuxtModuleVersion('@nuxt/ui', nuxt)
  logger.warn(
    `@nuxt/ui ${found || '(unknown version)'} is older than ${MINIMUM_NUXT_UI}, which Eponyme needs in order to share Tailwind with it.\n`
    + `  Upgrade it with \`npm i @nuxt/ui@^${MINIMUM_NUXT_UI}\`. Keeping an older one resolves a Tailwind this module was not built\n`
    + `  against, and what that breaks is not predictable: broken dashboard styles are the visible case, but it can also fail the\n`
    + `  build or misbehave somewhere with no obvious link back to this warning.`,
  )
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
    await warnOnIncompatibleNuxtUi(nuxt, logger)
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
    // Announced rather than done quietly: these route rules are written into the host's own
    // configuration, where nobody reading that file would think to look for them.
    const tagged = tagPreviewPathRoutes(options.previewPaths ?? {}, nuxt.options.routeRules ??= {})
    if (tagged.length) {
      const width = Math.max(...tagged.map(({ route }) => route.length))
      logger.info(
        `Cache tags added to ${tagged.length} public route${tagged.length > 1 ? 's' : ''}, so publishing can purge them:\n`
        + tagged.map(({ route, tag }) => `  ${route.padEnd(width)}  ${tag}`).join('\n'),
      )
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

    addTypeTemplate({
      filename: 'types/eponyme-config.d.ts',
      getContents: () => `declare module '#eponyme/config' {\n  const config: typeof import(${JSON.stringify(configPath)})['default']\n  export default config\n}\n`
        + `declare module '#eponyme/variables' {\n  const variables: typeof import(${JSON.stringify(nuxt.options.alias['#eponyme/variables'])})['default']\n  export default variables\n}\n`,
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
