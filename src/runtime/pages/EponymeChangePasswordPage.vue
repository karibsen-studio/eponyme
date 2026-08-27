<script setup lang="ts">
import { t } from '#eponyme/locale'
import { navigateTo, useRuntimeConfig, useSeoMeta } from '#app'
import { computed, ref } from 'vue'
import { useEponymeAuth } from '../composables/useEponymeAuth'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import EponymeScreen from '../components/editor/EponymeScreen.vue'
import EPButton from '../components/ui/EPButton.vue'
import EPFormField from '../components/ui/EPFormField.vue'
import EPInputPassword from '../components/ui/EPInputPassword.vue'
import { getEponymeErrorMessage } from '../utils/eponyme-error'

useEponymeFavicon()
useSeoMeta({ title: t('password.title') })

const auth = useEponymeAuth()
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const error = ref('')
const dashboardPath = computed(() => (useRuntimeConfig().public.eponyme as { dashboardPath?: string } | undefined)?.dashboardPath ?? '/__eponyme')

async function submit() {
  error.value = ''
  if (newPassword.value !== confirmation.value) {
    error.value = t('password.mismatch')
    return
  }
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    await navigateTo(dashboardPath.value)
  }
  catch (caught) {
    error.value = getEponymeErrorMessage(caught, t('server.passwordChangeFailed'))
  }
}

async function logout() {
  await auth.logout()
  await navigateTo(`${dashboardPath.value}/login`)
}
</script>

<template>
  <EponymeScreen class="ep:flex ep:items-center ep:justify-center ep:px-6 ep:py-12">
    <section class="ep:w-full ep:max-w-md">
      <h1 class="ep:mt-2 ep:mb-2 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong">
        {{ t('password.heading') }}
      </h1>
      <p class="ep:mt-0 ep:mb-8 ep:text-sm ep:leading-relaxed ep:text-text-muted">
        {{ t('password.subheading') }}
      </p>
      <form
        class="ep:grid ep:gap-5"
        @submit.prevent="submit"
      >
        <EPFormField
          id="eponyme-current-password"
          :label="t('password.current')"
          required
        >
          <EPInputPassword
            id="eponyme-current-password"
            v-model="currentPassword"
            autocomplete="current-password"
            required
          />
        </EPFormField>
        <EPFormField
          id="eponyme-new-password"
          :label="t('password.new')"
          :description="t('password.newHint')"
          required
        >
          <EPInputPassword
            id="eponyme-new-password"
            v-model="newPassword"
            autocomplete="new-password"
            required
          />
        </EPFormField>
        <EPFormField
          id="eponyme-confirm-password"
          :label="t('password.confirm')"
          required
        >
          <EPInputPassword
            id="eponyme-confirm-password"
            v-model="confirmation"
            autocomplete="new-password"
            required
          />
        </EPFormField>
        <p
          v-show="error"
          class="ep:m-0 ep:text-sm ep:text-danger"
          role="alert"
        >
          {{ error }}
        </p>
        <div class="ep:flex ep:flex-wrap ep:gap-2">
          <EPButton
            type="submit"
            variant="primary"
            :loading="auth.pending.value"
            :disabled="!currentPassword || !newPassword || !confirmation"
          >
            {{ t('password.submit') }}
          </EPButton>
          <EPButton @click="logout">
            {{ t('password.signOut') }}
          </EPButton>
        </div>
      </form>
    </section>
  </EponymeScreen>
</template>
