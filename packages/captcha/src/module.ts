import { addServerImportsDir, createResolver, defineNuxtModule, installModule } from '@nuxt/kit'

export interface ModuleOptions {
  /** Public site key of the Turnstile widget. */
  siteKey?: string
}

/**
 * Plugs Cloudflare Turnstile into Eponyme's captcha contract by overriding the
 * `#eponyme/captcha` alias. Install it after `@karibsen/eponyme`; the core resolves
 * that alias to a stand-in that refuses every token, so a form declaring
 * `captcha: true` fails closed until an adapter like this one is present.
 *
 * The secret key stays server-side, read from `NUXT_TURNSTILE_SECRET_KEY`.
 */
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@karibsen/eponyme-captcha',
    configKey: 'eponymeCaptcha',
  },

  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    await installModule('@nuxtjs/turnstile', options.siteKey ? { siteKey: options.siteKey } : {}, nuxt)

    // Assigned rather than defaulted: this module's whole purpose is to replace the
    // core's stand-in verifier.
    nuxt.options.alias['#eponyme/captcha'] = resolver.resolve('./runtime/verifier')

    addServerImportsDir(resolver.resolve('./runtime'))
  },
})
