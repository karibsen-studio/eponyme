import { createResolver, defineNuxtModule } from '@nuxt/kit'

/**
 * Stands in for a real adapter such as @karibsen/eponyme-captcha: it overrides the
 * same alias, so the contract is exercised without reaching Cloudflare over the network.
 */
export default defineNuxtModule({
  meta: { name: 'fake-captcha' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    nuxt.options.alias['#eponyme/captcha'] = resolver.resolve('../captcha/verifier')
  },
})
