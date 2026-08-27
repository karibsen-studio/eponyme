import { useRequestFetch, useState } from '#app'
import { computed } from 'vue'
import type {
  EponymeAuthUser,
  EponymePermissionAction,
  EponymePermissionRule,
  EponymeResource,
} from '../types'
import { canEponyme } from '../utils/eponyme-permissions'

export function useEponymeAuth() {
  const user = useState<EponymeAuthUser | null>('eponyme:auth-user', () => null)
  const loaded = useState<boolean>('eponyme:auth-loaded', () => false)
  const pending = useState<boolean>('eponyme:auth-pending', () => false)
  const permissions = useState<EponymePermissionRule[]>('eponyme:auth-permissions', () => [])
  const requestFetch = useRequestFetch()

  async function refresh() {
    pending.value = true
    try {
      const response = await requestFetch<{ user: EponymeAuthUser | null, permissions: EponymePermissionRule[] }>('/api/eponyme-auth/session', {
        cache: 'no-store',
      })
      user.value = response.user
      permissions.value = response.permissions
      loaded.value = true
      return response.user
    }
    catch {
      user.value = null
      permissions.value = []
      loaded.value = true
      return null
    }
    finally {
      pending.value = false
    }
  }

  async function ensureLoaded() {
    return loaded.value ? user.value : await refresh()
  }

  async function login(username: string, password: string) {
    pending.value = true
    try {
      const response = await requestFetch<{ user: EponymeAuthUser, permissions: EponymePermissionRule[] }>('/api/eponyme-auth/login', {
        method: 'POST',
        body: { username, password },
      })
      user.value = response.user
      permissions.value = response.permissions
      loaded.value = true
      return response.user
    }
    finally {
      pending.value = false
    }
  }

  async function logout() {
    pending.value = true
    try {
      await requestFetch('/api/eponyme-auth/logout', { method: 'POST' })
    }
    finally {
      user.value = null
      permissions.value = []
      loaded.value = true
      pending.value = false
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    pending.value = true
    try {
      const response = await requestFetch<{ user: EponymeAuthUser, permissions: EponymePermissionRule[] }>('/api/eponyme-auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      })
      user.value = response.user
      permissions.value = response.permissions
      loaded.value = true
      return response.user
    }
    finally {
      pending.value = false
    }
  }

  function can(action: EponymePermissionAction, resource: EponymeResource): boolean {
    return canEponyme(permissions.value, action, resource)
  }

  return {
    user,
    loaded,
    pending,
    permissions,
    role: computed(() => user.value?.role),
    isViewer: computed(() => user.value?.role === 'viewer'),
    canEdit: computed(() => permissions.value.some(rule => rule.effect === 'allow'
      && rule.actions.some(action => action === 'content.create' || action === 'content.update'))),
    isOwner: computed(() => user.value?.role === 'owner'),
    mustChangePassword: computed(() => Boolean(user.value?.mustChangePassword)),
    can,
    ensureLoaded,
    refresh,
    login,
    logout,
    changePassword,
  }
}
