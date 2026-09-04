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
  updateTemplates,
  useLogger,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import pc from 'picocolors'
import tailwindcss from '@tailwindcss/vite'
import { eponymeConfigInteger } from './config/numbers'
import { renderEponymeLocaleModule, resolveEponymeLocale } from './locale-build'
import type { EponymeLocaleDefinition } from './runtime/locales'
import { resolve } from 'pathe'
import { tagPreviewPathRoutes } from './runtime/utils/cache-tags'
import { createEponymeThemeBootstrap } from './runtime/utils/eponyme-theme'
import type { EponymePublicationOption } from './runtime/utils/eponyme-publication'
import {
  renderEponymeCustomFieldComponents,
  renderEponymeCustomFields,
  renderEponymeCustomFieldTypes,
  scanEponymeCustomFields,
} from './custom-fields-build'

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
   * Route the dashboard is served on.
   *
   * @default "/__eponyme"
   */
  dashboardPath?: string

  /**
   * Public route rendering each entry, keyed by singleton name or by collection name. A collection value
   * must contain `:slug`.
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
   * Whether the editor offers the publication tab: current status, scheduling, unpublishing and reverting
   * to draft.
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
     * Lifetime of an authenticated session, in days, counted from sign-in and never extended by activity.
     *
     * @default 7
     */
    sessionDurationDays?: number
  }

  /** Retention of the audit log. */
  audit?: {
    /** Number of days audit events are retained. @default 365 */
    retentionDays?: number
    /** How often the cleanup job may run, whatever the schedule calls it. @default 24 */
    pruneIntervalHours?: number
  }

  /** File storage: the media library, uploads, and what `field.file()` writes into. */
  storage?: {
    /**
     * Path to the factory file, relative to the project root.
     *
     * @default "eponyme.storage.ts"
     */
    driver?: string

    /**
     * Key prefix every upload is written under, and the only part of the bucket the media routes can reach.
     *
     * @default "uploads"
     */
    prefix?: string

    /**
     * Largest accepted upload, in bytes.
     *
     * @default 26214400 – 25 MiB
     */
    maxSize?: number

    /**
     * Media types uploads are restricted to; `image/*` style wildcards are understood. Empty accepts
     * anything.
     *
     * @default []
     * @example ['image/*', 'application/pdf']
     */
    accept?: string[]
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
   * @default 5
   */
  cacheSeconds?: number

  /**
   * Name of a Nitro storage mount the content cache is shared through, typically Redis. Left out, the
   * cache stays in the memory of each instance.
   *
   * @see https://nitro.build/guide/storage
   */
  cacheStorage?: string

  /**
   * Whether the filterable index is rebuilt at startup when the configuration that produced it has changed.
   *
   * @default true
   */
  autoReindex?: boolean

  /**
   * How long a browser may reuse published content, in seconds.
   *
   * @default 30
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
   */
  browserCacheSeconds?: number

  /**
   * How long a CDN may reuse published content, in seconds.
   *
   * @default 300
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
   */
  cdnCacheSeconds?: number

  /**
   * Language of the dashboard interface, resolved once at build time.
   *
   * @default undefined – English
   * @example
   * ```ts
   * import { fr } from '@eponyme/locale/fr'
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

/** `@nuxt/ui` is not a dependency - the dashboard brings its own components. */
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

/** A year, which is the longest a cache header or a session may reasonably ask for. */
const MAX_CACHE_SECONDS = 31_536_000
const MAX_SESSION_DAYS = 365

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  return integerInRange(value, fallback, name, 1, Number.MAX_SAFE_INTEGER)
}

function integerInRange(value: number | undefined, fallback: number, name: string, min: number, max: number): number {
  return eponymeConfigInteger(name, value, { fallback, min, max, prefix: pc.red('[Eponyme]') })
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@karibsen/eponyme',
    configKey: 'eponyme',
    compatibility: {
      nuxt: '>=4.5.1',
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
    audit: {
      retentionDays: 365,
      pruneIntervalHours: 24,
    },
    rateLimits: {
      loginPerIp: 10,
      loginGlobal: 300,
      loginAccountFailures: 5,
      formPerIp: 5,
      formGlobal: 100,
    },
    storage: {
      driver: 'eponyme.storage.ts',
      prefix: 'uploads',
      maxSize: 25 * 1024 * 1024,
      accept: [],
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
            'mingcute:delete-2-line',
            'mingcute:file-line',
            'mingcute:youtube-line',
            'mingcute:movie-line',
            'mingcute:film-line',
            'mingcute:alert-line',
            'mingcute:fullscreen-exit-2-line',
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

    const customFieldsDirectory = resolve(nuxt.options.rootDir, 'eponyme/fields')
    const readCustomFields = () => scanEponymeCustomFields(nuxt.options.rootDir)
    const initialCustomFields = await readCustomFields()
    const customFieldsTemplate = addTemplate({
      filename: 'eponyme-custom-fields.mjs',
      write: true,
      getContents: async () => renderEponymeCustomFields(await readCustomFields()),
    })
    const customFieldComponentsTemplate = addTemplate({
      filename: 'eponyme-custom-field-components.mjs',
      write: true,
      getContents: async () => renderEponymeCustomFieldComponents(await readCustomFields()),
    })
    const customFieldTypesTemplate = addTypeTemplate({
      filename: 'types/eponyme-custom-fields.d.ts',
      getContents: async () => renderEponymeCustomFieldTypes(await readCustomFields()),
    }, { nuxt: true, nitro: true })
    nuxt.options.alias['#eponyme/custom-fields'] = customFieldsTemplate.dst
    nuxt.options.alias['#eponyme/custom-field-components'] = customFieldComponentsTemplate.dst
    nuxt.options.watch.push(customFieldsDirectory)
    nuxt.hook('builder:watch', async (_event, path) => {
      if (!path.replaceAll('\\', '/').includes('eponyme/fields/')) return
      await updateTemplates({
        filter: template => [customFieldsTemplate.dst, customFieldComponentsTemplate.dst, customFieldTypesTemplate.dst].includes(template.dst),
      })
    })
    if (initialCustomFields.length)
      logger.info(`Custom fields: ${initialCustomFields.map(field => field.name).join(', ')}`)

    const rolesPath = await findPath(resolve(nuxt.options.rootDir, 'eponyme/roles.ts'))
    nuxt.options.alias['#eponyme/roles'] = rolesPath ?? resolver.resolve('./runtime/utils/empty-roles')
    if (rolesPath) logger.info(`Custom roles loaded from ${rolesPath}.`)
    // The registry is read once per process and the alias is resolved here, so a role edited in development
    // only takes effect after a restart.
    nuxt.options.watch.push(resolve(nuxt.options.rootDir, 'eponyme/roles.ts'))
    nuxt.hook('builder:watch', async (_event, path) => {
      if (!path.replaceAll('\\', '/').endsWith('eponyme/roles.ts')) return
      await nuxt.callHook('restart')
    })

    // Nitro decides what gets stored, so it keeps the parser loaded up front; the browser fetches the
    // metadata the first time a phone value appears.
    nuxt.options.alias['#eponyme/phone'] = resolver.resolve('./runtime/utils/normalize-phone')
    extendViteConfig((config) => {
      config.resolve ??= {}
      config.resolve.alias = {
        ...config.resolve.alias,
        '#eponyme/phone': resolver.resolve('./runtime/utils/lazy-phone'),
      }
    })

    // Storage is on only if the factory file is actually there: routes, media library and the upload half
    // of `field.file()` are all registered from this one boolean.
    const storagePath = await findPath(resolve(nuxt.options.rootDir, options.storage?.driver || 'eponyme.storage.ts'))
    const storageEnabled = Boolean(storagePath)
    const storagePrefix = (options.storage?.prefix ?? 'uploads').replace(/^\/+|\/+$/g, '')
    nuxt.options.alias['#eponyme/storage'] = storagePath ?? resolver.resolve('./runtime/utils/empty-storage')

    const storageMaxSize = positiveInteger(options.storage?.maxSize, 25 * 1024 * 1024, 'eponyme.storage.maxSize')
    const storageAccept = options.storage?.accept ?? []

    const publicRuntimeConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>
    publicRuntimeConfig.eponyme = {
      previewPaths: options.previewPaths ?? {},
      dashboardPath,
      // Where the dashboard teleports itself, out of the host application's `app.vue`.
      teleportTarget: `#${nuxt.options.app.teleportAttrs?.id ?? 'teleports'}`,
      colorPresets: options.colorPresets ?? [],
      publication: options.publication ?? true,
      storage: storageEnabled,
      storageAccept,
      storageMaxSize,
    }
    nuxt.options.runtimeConfig.eponymeStorage = {
      prefix: storagePrefix,
      maxSize: storageMaxSize,
      accept: storageAccept,
      // Read from the environment rather than from `nuxt.config`, so a secret never reaches a file that is
      // committed.
      accessKeyId: process.env.EPONYME_STORAGE_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.EPONYME_STORAGE_SECRET_ACCESS_KEY ?? '',
      sessionToken: process.env.EPONYME_STORAGE_SESSION_TOKEN ?? '',
    }
    nuxt.options.runtimeConfig.eponymeAuth = {
      sessionDurationDays: integerInRange(options.auth?.sessionDurationDays, 7, 'eponyme.auth.sessionDurationDays', 1, MAX_SESSION_DAYS),
    }
    nuxt.options.runtimeConfig.eponymeAudit = {
      retentionDays: positiveInteger(options.audit?.retentionDays, 365, 'eponyme.audit.retentionDays'),
      pruneIntervalHours: positiveInteger(options.audit?.pruneIntervalHours, 24, 'eponyme.audit.pruneIntervalHours'),
      // From the environment, so the secret never reaches a committed file.
      cronSecret: process.env.EPONYME_CRON_SECRET ?? '',
    }
    nuxt.options.runtimeConfig.eponymeRateLimits = {
      loginPerIp: positiveInteger(options.rateLimits?.loginPerIp, 10, 'eponyme.rateLimits.loginPerIp'),
      loginGlobal: positiveInteger(options.rateLimits?.loginGlobal, 300, 'eponyme.rateLimits.loginGlobal'),
      loginAccountFailures: positiveInteger(options.rateLimits?.loginAccountFailures, 5, 'eponyme.rateLimits.loginAccountFailures'),
      formPerIp: positiveInteger(options.rateLimits?.formPerIp, 5, 'eponyme.rateLimits.formPerIp'),
      formGlobal: positiveInteger(options.rateLimits?.formGlobal, 100, 'eponyme.rateLimits.formGlobal'),
    }
    const eponymeContent = {
      // Zero is a value here: it disables the cache rather than misconfiguring it.
      cacheSeconds: integerInRange(options.cacheSeconds, 5, 'eponyme.cacheSeconds', 0, MAX_CACHE_SECONDS),
      cacheStorage: options.cacheStorage?.trim() || '',
      autoReindex: options.autoReindex ?? true,
      browserCacheSeconds: integerInRange(options.browserCacheSeconds, 30, 'eponyme.browserCacheSeconds', 0, MAX_CACHE_SECONDS),
      cdnCacheSeconds: integerInRange(options.cdnCacheSeconds, 300, 'eponyme.cdnCacheSeconds', 0, MAX_CACHE_SECONDS),
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

    // Shipped augmentations sit in `node_modules`, which an application's tsconfig excludes.
    const shippedAugmentations = [
      './runtime/types/nitro.d.ts',
      './runtime/types/eponyme-custom-fields.d.ts',
    ]
    addTypeTemplate({
      filename: 'types/eponyme-augmentations.d.ts',
      getContents: () => shippedAugmentations
        .map(file => `/// <reference path=${JSON.stringify(resolver.resolve(file))} />\n`)
        .join(''),
    }, { nuxt: true, nitro: true })

    addTypeTemplate({
      filename: 'types/eponyme-locale.d.ts',
      getContents: () => `declare module '#eponyme/locale' {\n`
        + `  import type { EponymeLocaleDefinition, EponymeMessageKey } from ${JSON.stringify(resolver.resolve('./runtime/locales'))}\n`
        + `  import type { EponymeTranslateParams } from ${JSON.stringify(resolver.resolve('./runtime/utils/translate'))}\n`
        + `  export const locale: EponymeLocaleDefinition\n`
        + `  export function t(key: EponymeMessageKey, params?: EponymeTranslateParams): string\n`
        + `}\n`,
    }, { nuxt: true, nitro: true })

    nuxt.options.app.head.script ??= []
    nuxt.options.app.head.script.unshift({
      key: 'eponyme-theme',
      innerHTML: createEponymeThemeBootstrap(dashboardPath),
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

    // `nuxt prepare` also runs on the module's own repository, where there is no host app to configure -
    // the requirements below only make sense when actually serving.
    const preparing = Boolean(nuxt.options._prepare)

    if (!options.prismaClient) {
      if (!preparing) throw new Error(`${pc.red('[Eponyme]')} eponyme.prismaClient is required.`)
      logger.info('No prismaClient configured, skipping wiring (prepare).')
      return
    }

    // Each alias keeps the meaning Nuxt gives it.
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
      { name: 'defineEponymeField', from: resolver.resolve('./eponyme') },
      { name: 'defineBlock', from: resolver.resolve('./eponyme') },
      { name: 'collection', from: resolver.resolve('./eponyme') },
      { name: 'form', from: resolver.resolve('./eponyme') },
      { name: 'defineEponymeVariables', from: resolver.resolve('./eponyme') },
      { name: 'defineEponymeRoles', from: resolver.resolve('./eponyme') },
      { name: 'permission', from: resolver.resolve('./eponyme') },
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
      { name: 'storeEponymeFormSubmission', from: resolver.resolve('./runtime/server/utils/eponyme-form') },
      { name: 'assertEponymeFormRateLimit', from: resolver.resolve('./runtime/server/utils/eponyme-form') },
      { name: 'getEponymeCacheTags', from: resolver.resolve('./runtime/server/utils/eponyme-cache') },
    ])
    addRouteMiddleware({
      name: 'eponyme-auth',
      path: resolver.resolve('./runtime/middleware/eponyme-auth'),
    })
    addRouteMiddleware({
      name: 'eponyme-permission',
      path: resolver.resolve('./runtime/middleware/eponyme-permission'),
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

    // Optional, and aliased rather than read here: variables may be functions, which runtimeConfig cannot
    // carry across the serialization boundary.
    const variablesPath = await findPath(resolve(nuxt.options.rootDir, 'eponyme.variables.ts'))
    nuxt.options.alias['#eponyme/variables'] = variablesPath ?? resolver.resolve('./runtime/utils/empty-variables')

    addTypeTemplate({
      filename: 'types/eponyme-config.d.ts',
      getContents: () => `declare module '#eponyme/config' {\n  const config: typeof import(${JSON.stringify(configPath)})['default']\n  export default config\n}\n`
        + `declare module '#eponyme/roles' {\n  const roles: typeof import(${JSON.stringify(nuxt.options.alias['#eponyme/roles'])})['default']\n  export default roles\n}\n`
        + `declare module '#eponyme/variables' {\n  const variables: typeof import(${JSON.stringify(nuxt.options.alias['#eponyme/variables'])})['default']\n  export default variables\n}\n`
        + `declare module '#eponyme/storage' {\n  const factory: typeof import(${JSON.stringify(nuxt.options.alias['#eponyme/storage'])})['default']\n  export default factory\n}\n`,
    }, { nuxt: true, nitro: true })

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
    addServerHandler({ route: '/api/eponyme-roles', handler: resolver.resolve('./runtime/server/api/eponyme-roles.get') })
    addServerHandler({ route: '/api/eponyme-audit', handler: resolver.resolve('./runtime/server/api/eponyme-audit.get') })
    // Both methods: hosted schedulers issue a `GET`, a human reaches for `POST`.
    addServerHandler({ route: '/api/eponyme-audit/prune', method: 'get', handler: resolver.resolve('./runtime/server/api/eponyme-audit/prune') })
    addServerHandler({ route: '/api/eponyme-audit/prune', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-audit/prune') })
    if (storageEnabled) {
      addServerHandler({ route: '/api/eponyme-media', handler: resolver.resolve('./runtime/server/api/eponyme-media/index.get') })
      addServerHandler({ route: '/api/eponyme-media/upload', method: 'post', handler: resolver.resolve('./runtime/server/api/eponyme-media/upload.post') })
      addServerHandler({ route: '/api/eponyme-media/object', method: 'put', handler: resolver.resolve('./runtime/server/api/eponyme-media/object.put') })
      addServerHandler({ route: '/api/eponyme-media/object', method: 'delete', handler: resolver.resolve('./runtime/server/api/eponyme-media/object.delete') })
      addServerHandler({ route: '/api/eponyme-media/raw/**', handler: resolver.resolve('./runtime/server/api/eponyme-media/raw/[path].get') })
      logger.info(`Storage enabled from ${storagePath}, media library at ${dashboardPath}/media.`)
    }

    addServerPlugin(resolver.resolve('./runtime/server/plugins/eponyme-sync'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/eponyme-role-registry'))

    if (!process.env.EPONYME_CRON_SECRET) {
      logger.info(
        'Audit retention is a scheduled route: set EPONYME_CRON_SECRET and call /api/eponyme-audit/prune with it as a bearer token. '
        + 'Until then, audit events are kept for ever.',
      )
    }

    nuxt.hook('pages:extend', (pages) => {
      pages.push(
        { name: 'eponyme-login', path: `${dashboardPath}/login`, file: resolver.resolve('./runtime/pages/EponymeLoginPage.vue'), meta: { layout: false } },
        { name: 'eponyme-change-password', path: `${dashboardPath}/change-password`, file: resolver.resolve('./runtime/pages/EponymeChangePasswordPage.vue'), meta: { layout: false, middleware: ['eponyme-auth'] } },
        // The shell is a parent route rather than a layout: a layout only renders when the host
        // application's `app.vue` uses `<NuxtLayout>`, which a module cannot require.
        {
          name: 'eponyme-dashboard',
          path: dashboardPath,
          file: resolver.resolve('./runtime/pages/EponymeDashboardShell.vue'),
          meta: { layout: false },
          children: [
            { name: 'eponyme-users', path: 'users', file: resolver.resolve('./runtime/pages/EponymeUsersPage.vue'), meta: { middleware: ['eponyme-auth', 'eponyme-permission'], eponymePermission: { action: 'users.manage', resource: { kind: 'system', name: 'users' } } } },
            { name: 'eponyme-audit', path: 'audit', file: resolver.resolve('./runtime/pages/EponymeAuditPage.vue'), meta: { middleware: ['eponyme-auth', 'eponyme-permission'], eponymePermission: { action: 'audit.read', resource: { kind: 'system', name: 'audit' } } } },
            ...(storageEnabled
              ? [{ name: 'eponyme-media', path: 'media', file: resolver.resolve('./runtime/pages/EponymeMediaPage.vue'), meta: { middleware: ['eponyme-auth'] } }]
              : []),
            { name: 'eponyme-index', path: '', file: resolver.resolve('./runtime/pages/EponymeIndexPage.vue'), meta: { middleware: ['eponyme-auth'] } },
            { name: 'eponyme-detail', path: ':eponyme(.*)*', file: resolver.resolve('./runtime/pages/EponymeDetailPage.vue'), meta: { middleware: ['eponyme-auth'] } },
          ],
        },
      )
    })

    logger.debug(`config loaded: ${configPath}`)
  },
})
