<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useRequestFetch, useSeoMeta } from '#app'
import { nextTick, ref } from 'vue'
import type { EponymeAuthUser, EponymeManagedUserResult, EponymeRole, EponymeRoleOption } from '../types'
import EponymeCopy from '../components/editor/EponymeCopy.vue'
import { useEponymeAuth } from '../composables/useEponymeAuth'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import EPAlertDialog from '../components/ui/EPAlertDialog.vue'
import EPButton from '../components/ui/EPButton.vue'
import EPDialog from '../components/ui/EPDialog.vue'
import EPFormField from '../components/ui/EPFormField.vue'
import EPInputText from '../components/ui/EPInputText.vue'
import EPSelect from '../components/ui/EPSelect.vue'
import EPSwitch from '../components/ui/EPSwitch.vue'
import EPTooltip from '../components/ui/EPTooltip.vue'
import EPAvatar from '../components/ui/EPAvatar.vue'
import { getEponymeErrorMessage } from '../utils/eponyme-error'
import '../assets/dashboard.css'

useEponymeFavicon()
const auth = useEponymeAuth()
/** The server refuses it either way; disabling the controls says so before the attempt. */
const isSelf = (user: EponymeAuthUser) => user.id === auth.user.value?.id
useSeoMeta({ title: t('users.title') })

const requestFetch = useRequestFetch()
const users = ref<EponymeAuthUser[]>([])
const pending = ref(true)
const error = ref('')
const createOpen = ref(false)
const createError = ref('')
const createErrorElement = ref<HTMLElement>()
const username = ref('')
const role = ref<EponymeRole>('editor')
const temporaryCredentials = ref<EponymeManagedUserResult>()
const resetTarget = ref<EponymeAuthUser>()
const resetPending = ref(false)
const resetError = ref('')
const roleOptions = ref<Array<{ label: string, value: string }>>([])

await Promise.all([loadUsers(), loadRoles()])

async function loadRoles() {
  // The registry already names a built-in role from the catalogue, so nothing is renamed here.
  const response = await requestFetch<{ roles: EponymeRoleOption[] }>('/api/eponyme-roles', { cache: 'no-store' })
  roleOptions.value = response.roles.map(item => ({ label: item.label, value: item.value }))
}

async function loadUsers() {
  pending.value = true
  try {
    const response = await requestFetch<{ users: EponymeAuthUser[] }>('/api/eponyme-users', { cache: 'no-store' })
    users.value = response.users
  }
  finally {
    pending.value = false
  }
}

async function createUser() {
  createError.value = ''
  try {
    const result = await requestFetch<EponymeManagedUserResult>('/api/eponyme-users', {
      method: 'POST',
      body: { username: username.value, role: role.value },
    })
    users.value.push(result.user)
    temporaryCredentials.value = result
    createOpen.value = false
    username.value = ''
    role.value = 'editor'
  }
  catch (caught) {
    createError.value = getEponymeErrorMessage(caught, t('server.userCreateFailed'))
    await nextTick()
    createErrorElement.value?.focus()
  }
}

function setCreateOpen(open: boolean) {
  createOpen.value = open
  createError.value = ''
}

async function updateUser(user: EponymeAuthUser, changes: { role?: EponymeRole, active?: boolean }) {
  error.value = ''
  try {
    const response = await requestFetch<{ user: EponymeAuthUser }>(`/api/eponyme-users/${user.id}`, {
      method: 'PATCH',
      body: changes,
    })
    replaceUser(response.user)
  }
  catch (caught) {
    error.value = getEponymeErrorMessage(caught, t('users.updateFailed'))
    await loadUsers()
  }
}

function requestPasswordReset(user: EponymeAuthUser) {
  resetTarget.value = user
  resetError.value = ''
}

function setResetOpen(open: boolean) {
  if (open || resetPending.value) return
  resetTarget.value = undefined
  resetError.value = ''
}

async function resetPassword() {
  const user = resetTarget.value
  if (!user || resetPending.value) return
  resetPending.value = true
  resetError.value = ''
  try {
    const result = await requestFetch<EponymeManagedUserResult>(`/api/eponyme-users/${user.id}/reset-password`, {
      method: 'POST',
    })
    replaceUser(result.user)
    resetTarget.value = undefined
    temporaryCredentials.value = result
  }
  catch (caught) {
    resetError.value = getEponymeErrorMessage(caught, t('users.resetFailed'))
  }
  finally {
    resetPending.value = false
  }
}

function replaceUser(user: EponymeAuthUser) {
  users.value = users.value.map(item => item.id === user.id ? user : item)
}
</script>

<template>
  <div class="ep:contents">
    <section class="ep:mx-auto ep:w-full ep:max-w-4xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
      <header class="ep:flex ep:flex-wrap ep:items-end ep:justify-between ep:gap-4">
        <div>
          <h1 class="ep:mt-2 ep:mb-0 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong">
            {{ t('users.heading') }}
          </h1>
          <p class="ep:mt-2 ep:mb-0 ep:text-sm ep:text-text-muted">
            {{ t('users.subheading') }}
          </p>
        </div>
        <EPButton
          size="sm"
          variant="primary"
          @click="setCreateOpen(true)"
        >
          {{ t('users.add') }}
        </EPButton>
      </header>

      <p
        v-show="error"
        class="ep:mt-6 ep:rounded-xl ep:bg-danger/10 ep:p-4 ep:text-sm ep:text-danger"
        role="alert"
      >
        {{ error }}
      </p>
      <p
        v-if="pending"
        class="ep:mt-8 ep:text-sm ep:text-text-muted"
      >
        {{ t('users.loading') }}
      </p>
      <div
        v-else
        class="ep:mt-8 ep:grid ep:gap-3"
      >
        <article
          v-for="user in users"
          :key="user.id"
          class="ep:grid ep:gap-4 ep:rounded-xl ep:bg-surface-active/50 ep:p-4 ep:sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto] ep:sm:items-center"
        >
          <div class="ep:flex ep:min-w-0 ep:items-center ep:gap-3">
            <EPAvatar :username="user.username" />
            <div class="ep:min-w-0">
              <p class="ep:m-0 ep:truncate ep:text-sm ep:font-semibold ep:text-text-strong">
                {{ user.username }}
              </p>
              <p
                v-if="user.mustChangePassword"
                class="ep:m-0 ep:mt-1 ep:text-xs ep:text-text-muted"
              >
                {{ t('users.mustChangePassword') }}
              </p>
            </div>
          </div>
          <EPSelect
            size="sm"
            :model-value="user.role"
            :options="roleOptions"
            :aria-label="t('users.role')"
            :disabled="isSelf(user)"
            @update:model-value="updateUser(user, { role: $event as EponymeRole })"
          />
          <EPButton
            size="sm"
            @click="requestPasswordReset(user)"
          >
            {{ t('users.resetPassword') }}
          </EPButton>
          <EPTooltip :content="isSelf(user) ? t('users.selfHint') : user.active ? t('users.active') : t('users.disabled')">
            <EPSwitch
              :model-value="user.active"
              :disabled="isSelf(user)"
              :aria-label="user.active ? t('users.deactivate', { user: user.username }) : t('users.activate', { user: user.username })"
              @update:model-value="updateUser(user, { active: $event })"
            />
          </EPTooltip>
        </article>
      </div>
    </section>

    <EPDialog
      :open="createOpen"
      :title="t('users.add')"
      :description="t('users.addDescription')"
      @update:open="setCreateOpen"
    >
      <form
        class="ep:grid ep:gap-4"
        @submit.prevent="createUser"
      >
        <p
          v-if="createError"
          ref="createErrorElement"
          tabindex="-1"
          class="ep:m-0 ep:rounded-lg ep:bg-danger/10 ep:p-3 ep:text-sm ep:text-danger ep:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-danger/30"
        >
          {{ createError }}
        </p>
        <EPFormField
          id="eponyme-user-username"
          :label="t('users.username')"
          :description="t('users.usernameHint')"
          required
        >
          <EPInputText
            id="eponyme-user-username"
            v-model="username"
            autocomplete="off"
            required
          />
        </EPFormField>
        <EPFormField
          id="eponyme-user-role"
          :label="t('users.role')"
          required
        >
          <EPSelect
            id="eponyme-user-role"
            v-model="role"
            :options="roleOptions"
          />
        </EPFormField>
        <div class="ep:flex ep:justify-end ep:gap-2">
          <EPButton @click="setCreateOpen(false)">
            {{ t('action.cancel') }}
          </EPButton>
          <EPButton
            type="submit"
            variant="primary"
          >
            {{ t('users.create') }}
          </EPButton>
        </div>
      </form>
    </EPDialog>

    <EPDialog
      :open="Boolean(temporaryCredentials)"
      :title="t('users.credentials')"
      :description="t('users.credentialsHint')"
      @update:open="!$event && (temporaryCredentials = undefined)"
    >
      <div v-if="temporaryCredentials">
        <dl class="ep:grid ep:gap-3">
          <div>
            <dt class="ep:text-xs ep:text-text-muted">
              {{ t('users.username') }}
            </dt>
            <dd class="ep:mt-1 ep:mb-0">
              <EponymeCopy
                :value="temporaryCredentials.user.username"
                :label="t('action.copy')"
              />
            </dd>
          </div>
          <div>
            <dt class="ep:text-xs ep:text-text-muted">
              {{ t('users.temporaryPassword') }}
            </dt>
            <dd class="ep:mt-1 ep:mb-0">
              <EponymeCopy
                :value="temporaryCredentials.temporaryPassword"
                :label="t('action.copy')"
              />
            </dd>
          </div>
        </dl>
        <p class="ep:mt-4 ep:mb-0 ep:text-xs ep:leading-relaxed ep:text-text-muted">
          {{ t('users.credentialsFooter') }}
        </p>
      </div>
    </EPDialog>

    <EPAlertDialog
      :open="Boolean(resetTarget)"
      :label="t('users.resetTitle')"
      :description="resetTarget ? t('users.resetDescription', { user: resetTarget.username }) : ''"
      :confirm-label="t('users.resetAction')"
      confirm-variant="primary"
      :confirm-loading="resetPending"
      :close-on-confirm="false"
      @update:open="setResetOpen"
      @confirm="resetPassword"
    >
      <p
        v-show="resetError"
        role="alert"
        class="ep:m-0 ep:rounded-lg ep:bg-danger/10 ep:p-3 ep:text-sm ep:text-danger"
      >
        {{ resetError }}
      </p>
    </EPAlertDialog>
  </div>
</template>
