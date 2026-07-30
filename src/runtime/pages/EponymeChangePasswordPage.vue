<script setup lang="ts">
import { navigateTo, useRuntimeConfig, useSeoMeta } from '#app'
import type { FetchError } from 'ofetch'
import { computed, ref } from 'vue'
import { useEponymeAuth } from '../composables/useEponymeAuth'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import EPButton from '../components/ui/EPButton.vue'
import EPFormField from '../components/ui/EPFormField.vue'
import EPInputText from '../components/ui/EPInputText.vue'

useEponymeFavicon()
useSeoMeta({ title: 'Change password · Eponyme' })

const auth = useEponymeAuth()
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const error = ref('')
const dashboardPath = computed(() => (useRuntimeConfig().public.eponyme as { dashboardPath?: string } | undefined)?.dashboardPath ?? '/__eponyme')

async function submit() {
  error.value = ''
  if (newPassword.value !== confirmation.value) {
    error.value = 'Password confirmation does not match.'
    return
  }
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    await navigateTo(dashboardPath.value)
  }
  catch (caught) {
    const fetchError = caught as FetchError
    error.value = fetchError.statusMessage ?? 'Unable to change password.'
  }
}

async function logout() {
  await auth.logout()
  await navigateTo(`${dashboardPath.value}/login`)
}
</script>

<template>
  <main class="eponyme-root ep:flex ep:min-h-screen ep:items-center ep:justify-center ep:bg-theme-ep ep:px-6 ep:py-12 ep:font-sans ep:text-text-ep">
    <section class="ep:w-full ep:max-w-md">
      <p class="ep:m-0 ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">
        Eponyme
      </p>
      <h1 class="ep:mt-2 ep:mb-2 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-white">
        Choose a new password
      </h1>
      <p class="ep:mt-0 ep:mb-8 ep:text-sm ep:leading-relaxed ep:text-muted-ep">
        Your temporary password must be replaced before you can use the dashboard. Use at least 12 characters.
      </p>
      <form
        class="ep:grid ep:gap-5"
        @submit.prevent="submit"
      >
        <EPFormField
          id="eponyme-current-password"
          label="Current password"
          required
        >
          <EPInputText
            id="eponyme-current-password"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required
          />
        </EPFormField>
        <EPFormField
          id="eponyme-new-password"
          label="New password"
          description="12 to 128 characters, different from the current password."
          required
        >
          <EPInputText
            id="eponyme-new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            required
          />
        </EPFormField>
        <EPFormField
          id="eponyme-confirm-password"
          label="Confirm new password"
          required
        >
          <EPInputText
            id="eponyme-confirm-password"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
          />
        </EPFormField>
        <p
          v-if="error"
          class="ep:m-0 ep:text-sm ep:text-danger-ep"
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
            Change password
          </EPButton>
          <EPButton @click="logout">
            Sign out
          </EPButton>
        </div>
      </form>
    </section>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
}
</style>
