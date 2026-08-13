import {
  addComponent,
  addPlugin,
  addImports,
  addImportsDir,
  addRouteMiddleware,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  extendViteConfig,
  findPath,
  getNuxtModuleVersion,
  hasNuxtModule,
  hasNuxtModuleCompatibility,
  useLogger,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import pc from 'picocolors'
import tailwindcss from '@tailwindcss/vite'
import { renderEponymeLocaleModule, resolveEponymeLocale } from './locale-build'
import type { EponymeLocaleDefinition } from './runtime/locales'
import { resolve } from 'pathe'
import { tagPreviewPathRoutes } from './runtime/utils/cache-tags'
import { EPONYME_THEME_BOOTSTRAP } from './runtime/utils/eponyme-theme'
import type { EponymePublicationOption } from './runtime/utils/eponyme-publication'

export type { EponymeLocaleDefinition, EponymeMessageKey } from './runtime/locales'

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

  /**
   * Whether the editor offers the publication tab: current status, scheduling, unpublishing
   * and reverting to draft.
   *
   * @remarks
   * A boolean answers for every entry. A record answers per entry, keyed by singleton name or
   * by collection name the way `previewPaths` is, with an unlisted name left enabled. A
   * collection overrides both with its own `publication`.
   *
   * Publishing and saving a draft stay in the editor toolbar either way, so disabling this
   * removes the editorial lifecycle from the interface rather than the ability to publish.
   * The API refuses the actions the tab carried, so a stale tab cannot still send them.
   *
   * @default true
   * @example
   * ```ts
   * publication: {
   *   'pages/homepage': false,
   *   articles: false,
   * }
   * ```
   */
  publication?: EponymePublicationOption

  auth?: {
    /**
     * Lifetime of an authenticated session, in days, counted from sign-in and never extended by
     * activity.
     *
     * @default 7
     */
    sessionDurationDays?: number
  }

  rateLimits?: {
    /** Login attempts per client address and minute. @default 10 */
    loginPerIp?: number
    /** Login attempts across the deployment and minute. @default 300 */
    loginGlobal?: number
    /** Failed login attempts per account and 15 minutes. @default 5 */
    loginAccountFailures?: number
    /** Managed-form submissions per client address, form and minute. @default 5 */
    formPerIp?: number
    /** Managed-form submissions per form across the deployment and minute. @default 100 */
    formGlobal?: number
  }

  /**
   * How long content already read may be reused, in seconds. `0` disables it.
   *
   * @remarks
   * Without `cacheStorage`, the cache is per instance and a save only clears the instance that
   * served it — so this also bounds how long another instance can still answer with the previous
   * content. With `cacheStorage`, an invalidation reaches every instance and this is simply how
   * long a cached read lives.
   *
   * @default 5
   */
  cacheSeconds?: number

  /**
   * Name of a Nitro storage mount the content cache is shared through, typically Redis.
   * Left out, the cache stays in the memory of each instance.
   *
   * @remarks
   * This is what makes a publication visible everywhere at once: a shared mount is a cache a
   * write can actually invalidate across instances, which an in-process map cannot be.
   *
   * A small in-process tier is kept in front of it either way — it coalesces the concurrent
   * reads of one render and answers repeats without a network hop — so an instance can still
   * miss an invalidation for up to a second.
   *
   * The mount is declared by the application, and the driver's `base` is what the keys are
   * prefixed with:
   *
   * ```ts
   * // nuxt.config.ts
   * nitro: {
   *   storage: {
   *     eponyme: { driver: 'redis', url: process.env.REDIS_URL, base: 'eponyme' },
   *   },
   * },
   * eponyme: { cacheStorage: 'eponyme', cacheSeconds: 60 },
   * ```
   *
   * Keys then read `eponyme:row:<name>` and `eponyme:rows:<collection>:<version>`.
   *
   * `unstorage` ships the Redis driver; the application adds `ioredis` itself, so a deployment
   * that caches in memory does not carry a Redis client it never builds.
   *
   * @see https://nitro.build/guide/storage
   */
  cacheStorage?: string

  /**
   * Whether the filterable index is rebuilt at startup when the configuration that produced
   * it has changed.
   *
   * @remarks
   * Leave it on. Ordinary writes keep the index current, but a field that becomes filterable
   * leaves the entries already stored without a row for it, and a filter on them then answers
   * "none" instead of failing — a wrong listing rather than an error.
   *
   * Turning it off is an escape hatch: if a rebuild ever fails on every boot, this gets the
   * application up again so `reindexEponymeEntries()` can be run by hand.
   *
   * @default true
   */
  autoReindex?: boolean

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

  /**
   * Language of the dashboard interface, resolved once at build time.
   *
   * @remarks
   * One language per build: the catalogue is merged over English and inlined, so a key the
   * locale does not carry falls back to English rather than showing raw. This never touches
   * content, schema labels, or a host's own `@nuxtjs/i18n` setup.
   *
   * Catalogues live in `@eponyme/locale`, one subpath per language, and each export is a
   * function so it can take overrides. Passing the function itself instead of calling it is
   * refused at setup with a message saying so.
   *
   * @default undefined — English
   * @example
   * ```ts
   * import { fr } from '@eponyme/locale/fr'
   *
   * export default defineNuxtConfig({
   *   eponyme: {
   *     locale: fr({ 'array.add': 'Ajouter un bloc' }),
   *   },
   * })
   * ```
   */
  locale?: EponymeLocaleDefinition
}

const MINIMUM_NUXT_UI = '4.10.0'

const CLIENT_DEPENDENCIES = [
  'slugify',
  'sortablejs',
  '@vueuse/core',
  '@vueuse/integrations/useSortable',
  '@tanstack/vue-table',
  'fuse.js',
  'zod',
  'libphonenumber-js/min',
  'maska/vue',
  '@tiptap/vue-3',
  '@tiptap/starter-kit',
  '@tiptap/extension-image',
  '@tiptap/extension-text-align',
  '@tiptap/extension-placeholder',
  '@tiptap/pm/model',
  '@tiptap/pm/state',
  '@tiptap/pm/view',
]

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

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1)
    throw new TypeError(`${pc.red('[Eponyme]')} ${name} must be a positive integer.`)
  return resolved
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@karibsen/eponyme',
    configKey: 'eponyme',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },

  defaults: {
    dashboardPath: '/__eponyme',
    previewPaths: {},
    prismaClient: '',
    colorPresets: [],
    publication: true,
    auth: {
      sessionDurationDays: 7,
    },
    rateLimits: {
      loginPerIp: 10,
      loginGlobal: 300,
      loginAccountFailures: 5,
      formPerIp: 5,
      formGlobal: 100,
    },
    cacheSeconds: 5,
    autoReindex: true,
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
            'mingcute:eye-close-line',
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
            'mingcute:youtube-line',
            'mingcute:movie-line',
            'mingcute:film-line',
            'mingcute:alert-line',
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
      publication: options.publication ?? true,
    }
    nuxt.options.runtimeConfig.eponymeAuth = {
      sessionDurationDays: options.auth?.sessionDurationDays ?? 7,
    }
    nuxt.options.runtimeConfig.eponymeRateLimits = {
      loginPerIp: positiveInteger(options.rateLimits?.loginPerIp, 10, 'eponyme.rateLimits.loginPerIp'),
      loginGlobal: positiveInteger(options.rateLimits?.loginGlobal, 300, 'eponyme.rateLimits.loginGlobal'),
      loginAccountFailures: positiveInteger(options.rateLimits?.loginAccountFailures, 5, 'eponyme.rateLimits.loginAccountFailures'),
      formPerIp: positiveInteger(options.rateLimits?.formPerIp, 5, 'eponyme.rateLimits.formPerIp'),
      formGlobal: positiveInteger(options.rateLimits?.formGlobal, 100, 'eponyme.rateLimits.formGlobal'),
    }
    const eponymeContent = {
      cacheSeconds: options.cacheSeconds ?? 5,
      cacheStorage: options.cacheStorage?.trim() || '',
      autoReindex: options.autoReindex ?? true,
      browserCacheSeconds: options.browserCacheSeconds ?? 30,
      cdnCacheSeconds: options.cdnCacheSeconds ?? 300,
    }
    nuxt.options.runtimeConfig.eponymeContent = eponymeContent

    const locale = resolveEponymeLocale(options.locale, pc.red('[Eponyme]'))
    if (locale.missing.length) {
      logger.warn(
        `The \`${locale.code}\` catalogue is missing ${locale.missing.length} key${locale.missing.length > 1 ? 's' : ''}, which fall back to English:\n`
        + locale.missing.map(key => `  - ${key}`).join('\n'),
      )
    }

    const translatorPath = await resolver.resolvePath('./runtime/utils/translate')
    const localeTemplate = addTemplate({
      filename: 'eponyme-locale.mjs',
      write: true,
      getContents: () => renderEponymeLocaleModule(locale, translatorPath),
    })

    nuxt.options.alias['#eponyme/locale'] = localeTemplate.dst
    addTypeTemplate({
      filename: 'types/eponyme-locale.d.ts',
      getContents: () => `declare module '#eponyme/locale' {\n`
        + `  import type { EponymeLocaleDefinition, EponymeMessageKey } from ${JSON.stringify(resolver.resolve('./runtime/locales'))}\n`
        + `  import type { EponymeTranslateParams } from ${JSON.stringify(resolver.resolve('./runtime/utils/translate'))}\n`
        + `  export const locale: EponymeLocaleDefinition\n`
        + `  export function t(key: EponymeMessageKey, params?: EponymeTranslateParams): string\n`
        + `}\n`,
    })

    nuxt.options.app.head.script ??= []
    nuxt.options.app.head.script.unshift({
      key: 'eponyme-theme',
      innerHTML: EPONYME_THEME_BOOTSTRAP,
    })
    addPlugin(resolver.resolve('./runtime/plugins/eponyme-theme'))

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
      { name: 'defineEponymeConfig', from: resolver.resolve('./eponyme') },
      { name: 'collection', from: resolver.resolve('./eponyme') },
      { name: 'form', from: resolver.resolve('./eponyme') },
      { name: 'defineEponymeVariables', from: resolver.resolve('./eponyme') },
      { name: 'field', from: resolver.resolve('./runtime/fields') },
      { name: 'today', from: resolver.resolve('./runtime/fields') },
      { name: 'eponymeMediaEmbedUrl', from: resolver.resolve('./runtime/utils/media-player') },
      { name: 'eponymeMediaThumbnailUrl', from: resolver.resolve('./runtime/utils/media-player') },
    ])
    addImportsDir(resolver.resolve('./runtime/composables'))
    addComponent({ name: 'EponymeRichText', filePath: resolver.resolve('./runtime/components/EponymeRichText') })
    addServerImports([
      { name: 'getEponymeSitemapEntries', from: resolver.resolve('./runtime/server/utils/eponyme-sitemap') },
      { name: 'reindexEponymeEntries', from: resolver.resolve('./runtime/server/utils/eponyme-reindex') },
      { name: 'runEponymeSchedule', from: resolver.resolve('./runtime/server/utils/eponyme-schedule') },
      { name: 'validateEponymeForm', from: resolver.resolve('./runtime/server/utils/eponyme-form') },
      // Lets a route Eponyme does not own feed the dashboard's submission list.
      { name: 'storeEponymeFormSubmission', from: resolver.resolve('./runtime/server/utils/eponyme-form') },
      { name: 'assertEponymeFormRateLimit', from: resolver.resolve('./runtime/server/utils/eponyme-form') },
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
    nuxt.options.build.transpile.push('reka-ui')

    extendViteConfig((config) => {
      config.optimizeDeps ??= {}
      config.optimizeDeps.include ??= []
      for (const id of CLIENT_DEPENDENCIES) {
        const specifier = `@karibsen/eponyme > ${id}`
        if (!config.optimizeDeps.include.includes(specifier)) {
          config.optimizeDeps.include.push(specifier)
        }
      }
    })
    nuxt.options.css.push(resolver.resolve('./runtime/assets/dashboard.css'))
    extendViteConfig((config) => {
      config.plugins ??= []
      config.plugins.push(tailwindcss())
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
        // The shell is a parent route rather than a layout: a layout only renders when the
        // host application's `app.vue` uses `<NuxtLayout>`, which a module cannot require.
        // Keeping it mounted across navigations is what spares the sidebar a remount.
        {
          name: 'eponyme-dashboard',
          path: dashboardPath,
          file: resolver.resolve('./runtime/pages/EponymeDashboardShell.vue'),
          meta: { layout: false },
          children: [
            { name: 'eponyme-users', path: 'users', file: resolver.resolve('./runtime/pages/EponymeUsersPage.vue'), meta: { middleware: ['eponyme-auth', 'eponyme-owner'] } },
            { name: 'eponyme-index', path: '', file: resolver.resolve('./runtime/pages/EponymeIndexPage.vue'), meta: { middleware: ['eponyme-auth'] } },
            { name: 'eponyme-detail', path: ':eponyme(.*)*', file: resolver.resolve('./runtime/pages/EponymeDetailPage.vue'), meta: { middleware: ['eponyme-auth'] } },
          ],
        },
      )
    })

    logger.debug(`config loaded: ${configPath}`)
  },
})
