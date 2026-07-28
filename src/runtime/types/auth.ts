export const EPONYME_ROLES = ['viewer', 'editor', 'owner'] as const

export type EponymeRole = typeof EPONYME_ROLES[number]

export interface EponymeAuthUser {
  id: string
  username: string
  role: EponymeRole
  active: boolean
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

export interface EponymeAuthSession {
  user: EponymeAuthUser | null
}

export interface EponymeManagedUserResult {
  user: EponymeAuthUser
  temporaryPassword: string
}

export function isEponymeRole(value: unknown): value is EponymeRole {
  return typeof value === 'string' && EPONYME_ROLES.includes(value as EponymeRole)
}

export function canEditEponyme(role: EponymeRole | undefined): boolean {
  return role === 'editor' || role === 'owner'
}
