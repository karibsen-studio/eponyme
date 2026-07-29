# @karibsen/eponyme-captcha

Captcha verification for [Eponyme](https://github.com/karibsen-studio/eponyme) public
forms, backed by [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/).

Eponyme ships no captcha of its own: it defines the contract, and an adapter such as
this one fills it. Until one is installed, a form declaring `captcha: true` refuses
every submission rather than silently accepting them.

## Installation

```bash
pnpm add @karibsen/eponyme-captcha
```

Register it **after** the Eponyme module:

```ts
export default defineNuxtConfig({
  modules: ['@karibsen/eponyme', '@karibsen/eponyme-captcha'],
  eponymeCaptcha: {
    siteKey: '<your-turnstile-site-key>',
  },
})
```

The secret key is read server-side from the environment and never reaches the browser:

```bash
NUXT_TURNSTILE_SECRET_KEY=<your-turnstile-secret-key>
```

## Usage

Require a captcha on the form:

```ts
export default defineEponymeConfig({
  contact: form({
    fields: { /* … */ },
    submission: { mode: 'managed' },
    captcha: true,
  }),
})
```

Then render the widget and bind its token. `useEponymeForm` sends it alongside the
fields, and the server verifies it before validating anything:

```vue
<script setup lang="ts">
const { fields, captchaToken, requiresCaptcha, submit } = useEponymeForm('contact')
</script>

<template>
  <form novalidate @submit.prevent="submit">
    <!-- your fields -->
    <NuxtTurnstile v-if="requiresCaptcha" v-model="captchaToken" />
    <button type="submit">Send</button>
  </form>
</template>
```

A failed verification answers `422` with a `_form` error, the same shape as any other
validation failure. Cloudflare's error codes stay in the server log: telling a bot which
check it failed only helps it.

## How it works

The module overrides the `#eponyme/captcha` alias with its own verifier, which Eponyme
calls from the public submission route. Writing another adapter means doing the same
thing with a different provider — the contract is a `name` and an
`async verify(token, { ip })` returning `{ success, reason? }`.

## License

MIT
