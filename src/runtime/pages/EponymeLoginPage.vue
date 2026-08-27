<script setup lang="ts">
import { t } from '#eponyme/locale'
import { navigateTo, useRoute, useRuntimeConfig, useSeoMeta } from '#app'
import { computed, ref } from 'vue'
import { useEponymeAuth } from '../composables/useEponymeAuth'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import EponymeScreen from '../components/editor/EponymeScreen.vue'
import EPButton from '../components/ui/EPButton.vue'
import EPFormField from '../components/ui/EPFormField.vue'
import EPInputPassword from '../components/ui/EPInputPassword.vue'
import EPInputText from '../components/ui/EPInputText.vue'
import { getEponymeErrorMessage } from '../utils/eponyme-error'
import logoUrl from '../assets/logo.png?url'

const route = useRoute()
const auth = useEponymeAuth()
const username = ref('')
const password = ref('')
const error = ref('')
const dashboardPath = computed(() => (useRuntimeConfig().public.eponyme as { dashboardPath?: string } | undefined)?.dashboardPath ?? '/__eponyme')

useEponymeFavicon()
useSeoMeta({ title: t('login.title') })

const existingUser = await auth.refresh()
if (existingUser)
  await navigateAfterLogin(existingUser.mustChangePassword)

async function submit() {
  error.value = ''
  try {
    const user = await auth.login(username.value, password.value)
    await navigateAfterLogin(user.mustChangePassword)
  }
  catch (caught) {
    error.value = getEponymeErrorMessage(caught, t('server.badCredentials'))
  }
}

async function navigateAfterLogin(mustChangePassword: boolean) {
  if (mustChangePassword)
    return navigateTo(`${dashboardPath.value}/change-password`)
  const redirect = Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect
  const destination = typeof redirect === 'string' && redirect.startsWith(`${dashboardPath.value}/`)
    ? redirect
    : dashboardPath.value
  return navigateTo(destination)
}
</script>

<template>
  <EponymeScreen class="ep:flex ep:items-center ep:justify-center ep:px-6 ep:py-12">
    <section class="ep:w-full ep:max-w-sm">
      <img
        :src="logoUrl"
        :alt="t('sidebar.logo')"
        class="ep:block ep:size-14"
      >
      <h1 class="ep:mt-4 ep:mb-2 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong">
        {{ t('login.heading') }}
      </h1>
      <p class="ep:mt-0 ep:mb-8 ep:text-sm ep:leading-relaxed ep:text-text-muted">
        {{ t('login.subheading') }}
      </p>
      <form
        class="ep:grid ep:gap-5"
        @submit.prevent="submit"
      >
        <EPFormField
          id="eponyme-login-username"
          :label="t('login.username')"
          required
        >
          <EPInputText
            id="eponyme-login-username"
            v-model="username"
            autocomplete="username"
            autofocus
            required
          />
        </EPFormField>
        <EPFormField
          id="eponyme-login-password"
          :label="t('login.password')"
          required
        >
          <EPInputPassword
            id="eponyme-login-password"
            v-model="password"
            autocomplete="current-password"
            required
          />
        </EPFormField>
        <p
          class="ep:m-0 ep:text-sm ep:text-danger"
          role="alert"
        >
          {{ error }}
        </p>
        <EPButton
          type="submit"
          variant="primary"
          :loading="auth.pending.value"
          :disabled="!username || !password"
          class="ep:w-full"
        >
          {{ t('login.heading') }}
        </EPButton>
      </form>
    </section>
  </EponymeScreen>
</template>
