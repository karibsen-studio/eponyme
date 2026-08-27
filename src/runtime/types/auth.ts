import type { EponymeDefaultRole, EponymeRole } from './permissions'

export type { EponymeDefaultRole, EponymeRole }

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
