<script setup lang="ts">
import { useRequestFetch, useRoute, useSeoMeta } from '#app'
import type { FetchError } from 'ofetch'
import { computed, ref } from 'vue'
import type { EponymeAuthUser, EponymeManagedUserResult, EponymeRole } from '../types'
import EponymeCopy from '../components/editor/EponymeCopy.vue'
import EponymeSidebar from '../components/editor/EponymeSidebar.vue'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import EPButton from '../components/ui/EPButton.vue'
import EPDialog from '../components/ui/EPDialog.vue'
import EPFormField from '../components/ui/EPFormField.vue'
import EPInputText from '../components/ui/EPInputText.vue'
import EPSelect from '../components/ui/EPSelect.vue'
import EPSwitch from '../components/ui/EPSwitch.vue'
import EPTooltip from '../components/ui/EPTooltip.vue'
import EPAvatar from '../components/ui/EPAvatar.vue'

useEponymeFavicon()
useSeoMeta({ title: 'Users · Eponyme' })

const route = useRoute()
const requestFetch = useRequestFetch()
const users = ref<EponymeAuthUser[]>([])
const pending = ref(true)
const error = ref('')
const createOpen = ref(false)
const username = ref('')
const role = ref<EponymeRole>('editor')
const temporaryCredentials = ref<EponymeManagedUserResult>()
const basePath = computed(() => route.path.replace(/\/users\/?$/, ''))
const roleOptions = [
  { label: 'Viewer', value: 'viewer' },
  { label: 'Editor', value: 'editor' },
  { label: 'Owner', value: 'owner' },
]

await loadUsers()

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
  error.value = ''
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
    error.value = (caught as FetchError).statusMessage ?? 'Unable to create user.'
  }
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
    error.value = (caught as FetchError).statusMessage ?? 'Unable to update user.'
    await loadUsers()
  }
}

async function resetPassword(user: EponymeAuthUser) {
  if (!confirm(`Reset the password for ${user.username}?`)) return
  error.value = ''
  try {
    const result = await requestFetch<EponymeManagedUserResult>(`/api/eponyme-users/${user.id}/reset-password`, {
      method: 'POST',
    })
    replaceUser(result.user)
    temporaryCredentials.value = result
  }
  catch (caught) {
    error.value = (caught as FetchError).statusMessage ?? 'Unable to reset password.'
  }
}

function replaceUser(user: EponymeAuthUser) {
  users.value = users.value.map(item => item.id === user.id ? user : item)
}
</script>

<template>
  <main class="eponyme-root ep:flex ep:min-h-screen ep:flex-col ep:bg-theme-ep ep:font-sans ep:text-text-ep ep:md:flex-row">
    <EponymeSidebar :base-path="basePath" />
    <section class="ep:mx-auto ep:w-full ep:max-w-4xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
      <header class="ep:flex ep:flex-wrap ep:items-end ep:justify-between ep:gap-4">
        <div>
          <p class="ep:m-0 ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">
            Access
          </p>
          <h1 class="ep:mt-2 ep:mb-0 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-white">
            Users
          </h1>
          <p class="ep:mt-2 ep:mb-0 ep:text-sm ep:text-muted-ep">
            Manage dashboard access and content permissions.
          </p>
        </div>
        <EPButton
          variant="primary"
          @click="createOpen = true"
        >
          Add user
        </EPButton>
      </header>

      <p
        v-if="error"
        class="ep:mt-6 ep:rounded-xl ep:bg-danger-ep/10 ep:p-4 ep:text-sm ep:text-danger-ep"
        role="alert"
      >
        {{ error }}
      </p>
      <p
        v-if="pending"
        class="ep:mt-8 ep:text-sm ep:text-muted-ep"
      >
        Loading users…
      </p>
      <div
        v-else
        class="ep:mt-8 ep:grid ep:gap-3"
      >
        <article
          v-for="user in users"
          :key="user.id"
          class="ep:grid ep:gap-4 ep:rounded-xl ep:bg-selected-ep/50 ep:p-4 ep:sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto] ep:sm:items-center"
        >
          <div class="ep:flex ep:min-w-0 ep:items-center ep:gap-3">
            <EPAvatar :fallback="user.username" />
            <div class="ep:min-w-0">
              <p class="ep:m-0 ep:truncate ep:text-sm ep:font-semibold ep:text-white">
                {{ user.username }}
              </p>
              <p
                v-if="user.mustChangePassword"
                class="ep:m-0 ep:mt-1 ep:text-xs ep:text-muted-ep"
              >
                Password change required
              </p>
            </div>
          </div>
          <EPSelect
            size="sm"
            :model-value="user.role"
            :options="roleOptions"
            aria-label="Role"
            @update:model-value="updateUser(user, { role: $event as EponymeRole })"
          />
          <EPButton
            size="sm"
            @click="resetPassword(user)"
          >
            Reset password
          </EPButton>
          <EPTooltip :content="user.active ? 'Active' : 'Disabled'">
            <EPSwitch
              :model-value="user.active"
              :aria-label="user.active ? `Deactivate ${user.username}` : `Activate ${user.username}`"
              @update:model-value="updateUser(user, { active: $event })"
            />
          </EPTooltip>
        </article>
      </div>
    </section>

    <EPDialog
      :open="createOpen"
      title="Add user"
      description="A temporary password will be generated and shown once."
      @update:open="createOpen = $event"
    >
      <form
        class="ep:grid ep:gap-4"
        @submit.prevent="createUser"
      >
        <EPFormField
          id="eponyme-user-username"
          label="Username"
          description="3 to 50 letters, numbers, dots, underscores or hyphens."
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
          label="Role"
          required
        >
          <EPSelect
            id="eponyme-user-role"
            v-model="role"
            :options="roleOptions"
          />
        </EPFormField>
        <div class="ep:flex ep:justify-end ep:gap-2">
          <EPButton @click="createOpen = false">
            Cancel
          </EPButton>
          <EPButton
            type="submit"
            variant="primary"
            :disabled="!username"
          >
            Create user
          </EPButton>
        </div>
      </form>
    </EPDialog>

    <EPDialog
      :open="Boolean(temporaryCredentials)"
      title="Temporary credentials"
      description="Copy this password now. It cannot be displayed again."
      @update:open="!$event && (temporaryCredentials = undefined)"
    >
      <div v-if="temporaryCredentials">
        <dl class="ep:grid ep:gap-3">
          <div>
            <dt class="ep:text-xs ep:text-muted-ep">
              Username
            </dt>
            <dd class="ep:mt-1 ep:mb-0">
              <EponymeCopy
                :value="temporaryCredentials.user.username"
                label="Copy"
              />
            </dd>
          </div>
          <div>
            <dt class="ep:text-xs ep:text-muted-ep">
              Temporary password
            </dt>
            <dd class="ep:mt-1 ep:mb-0">
              <EponymeCopy
                :value="temporaryCredentials.temporaryPassword"
                label="Copy"
              />
            </dd>
          </div>
        </dl>
        <p class="ep:mt-4 ep:mb-0 ep:text-xs ep:leading-relaxed ep:text-muted-ep">
          The user must replace it immediately after signing in.
        </p>
      </div>
    </EPDialog>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
}
</style>
