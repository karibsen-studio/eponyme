export const EPONYME_DEFAULT_ROLES = ['viewer', 'editor', 'owner'] as const

export type EponymeDefaultRole = typeof EPONYME_DEFAULT_ROLES[number]

/** Applications may store their own role names. */
export type EponymeRole = EponymeDefaultRole | (string & {})

export const EPONYME_PERMISSION_ACTIONS = [
  'content.read',
  'content.create',
  'content.update',
  'content.publish',
  'content.unpublish',
  'content.schedule',
  'content.trash',
  'content.restore',
  'content.purge',
  'content.export',
  'content.import',
  'submissions.read',
  'submissions.delete',
  'media.read',
  'media.upload',
  'media.delete',
  'users.manage',
  'audit.read',
] as const

export type EponymePermissionAction = typeof EPONYME_PERMISSION_ACTIONS[number]

/** Dashboard features that are not content, and are only ever reached by `permission.system()`. */
export const EPONYME_SYSTEM_RESOURCES = ['content', 'media', 'users', 'audit'] as const

export type EponymeSystemResource = typeof EPONYME_SYSTEM_RESOURCES[number]

export type EponymeResourceKind = 'singleton' | 'collection' | 'form' | 'folder' | 'system'

export interface EponymeResource {
  kind: EponymeResourceKind
  name: string
}

export interface EponymePermissionTarget {
  kind: EponymeResourceKind | 'all'
  name?: string
}

export interface EponymePermissionRule {
  effect: 'allow' | 'deny'
  actions: EponymePermissionAction[]
  resources: EponymePermissionTarget[]
}

export interface EponymeRoleDefinition {
  label: string
  description?: string
  permissions: EponymePermissionRule[]
}

export type EponymeRoleDefinitions = Record<string, EponymeRoleDefinition>

export interface EponymeRoleOption {
  label: string
  value: string
  default: boolean
}
