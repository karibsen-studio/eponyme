import config from '#eponyme/config'
import { t } from '#eponyme/locale'
import customRoles from '#eponyme/roles'
import {
  EPONYME_DEFAULT_ROLES,
  EPONYME_PERMISSION_ACTIONS,
  EPONYME_SYSTEM_RESOURCES,
  type EponymePermissionAction,
  type EponymePermissionRule,
  type EponymeResource,
  type EponymeRoleDefinition,
  type EponymeRoleDefinitions,
  type EponymeRoleOption,
} from '../../types/permissions'
import { canEponyme, normalizeEponymeResource } from '../../utils/eponyme-permissions'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from '../../utils/get-eponyme-schemas'

const everySystemResource: EponymePermissionRule['resources']
  = EPONYME_SYSTEM_RESOURCES.map(name => ({ kind: 'system' as const, name }))

const sensitiveActions = new Set<EponymePermissionAction>([
  'content.purge',
  'content.import',
  'users.manage',
  'audit.read',
])

const readRules: EponymePermissionRule[] = [
  allow(['content.read', 'submissions.read'], [{ kind: 'all' }]),
]

const defaultRoles: EponymeRoleDefinitions = {
  viewer: {
    label: t('role.viewer'),
    permissions: readRules,
  },
  editor: {
    label: t('role.editor'),
    permissions: [
      ...readRules,
      allow([
        'content.create',
        'content.update',
        'content.publish',
        'content.unpublish',
        'content.schedule',
        'content.trash',
        'content.restore',
        'submissions.delete',
      ], [{ kind: 'all' }]),
      allow(['content.export'], [{ kind: 'system', name: 'content' }]),
      allow(['media.read', 'media.upload', 'media.delete'], [{ kind: 'system', name: 'media' }]),
    ],
  },
  owner: {
    label: t('role.owner'),
    permissions: [allow(EPONYME_PERMISSION_ACTIONS, [{ kind: 'all' }, ...everySystemResource])],
  },
}

let registry: EponymeRoleDefinitions | undefined

export function getEponymeRoleRegistry(): EponymeRoleDefinitions {
  if (registry) return registry
  validateCustomRoles(customRoles)
  registry = deepFreeze({ ...defaultRoles, ...customRoles })
  return registry
}

/**
 * The rules are handed straight to `/api/eponyme-auth/session`, so a caller must not be able to
 * widen its own permissions by pushing onto the array it was given.
 */
function deepFreeze(roles: EponymeRoleDefinitions): EponymeRoleDefinitions {
  for (const definition of Object.values(roles)) {
    for (const rule of definition.permissions) {
      Object.freeze(rule.actions)
      rule.resources.forEach(resource => Object.freeze(resource))
      Object.freeze(rule.resources)
      Object.freeze(rule)
    }
    Object.freeze(definition.permissions)
    Object.freeze(definition)
  }
  return Object.freeze(roles)
}

export function getEponymeRoleOptions(): EponymeRoleOption[] {
  return Object.entries(getEponymeRoleRegistry()).map(([value, definition]) => ({
    value,
    label: definition.label,
    default: (EPONYME_DEFAULT_ROLES as readonly string[]).includes(value),
  }))
}

export function getEponymePermissions(role: string | undefined): EponymePermissionRule[] {
  if (!role) return []
  return getEponymeRoleRegistry()[role]?.permissions ?? []
}

export function hasEponymePermission(
  role: string | undefined,
  action: EponymePermissionAction,
  resource: EponymeResource,
): boolean {
  if (role === 'owner') return true
  return canEponyme(getEponymePermissions(role), action, normalizeEponymeResource(resource))
}

export function resolveEponymeContentResource(name: string): EponymeResource | undefined {
  const normalized = name.replace(/^\/+|\/+$/g, '')
  const schemas = getEponymeSchemas(config)
  if (schemas[normalized]) return { kind: 'singleton', name: normalized }
  const collections = getEponymeCollections(config)
  if (collections[normalized]) return { kind: 'collection', name: normalized }
  const collection = Object.keys(collections).find(candidate => normalized.startsWith(`${candidate}/`)
    && !normalized.slice(candidate.length + 1).includes('/'))
  return collection ? { kind: 'collection', name: collection } : undefined
}

function validateCustomRoles(value: unknown): asserts value is EponymeRoleDefinitions {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('[Eponyme] eponyme/roles.ts must export an object created with defineEponymeRoles().')

  for (const [name, definition] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name))
      throw new TypeError(`[Eponyme] Custom role "${name}" must use lowercase letters, numbers and hyphens.`)
    if ((EPONYME_DEFAULT_ROLES as readonly string[]).includes(name))
      throw new TypeError(`[Eponyme] Custom role "${name}" cannot replace a built-in role.`)
    validateRoleDefinition(name, definition)
  }
}

function validateRoleDefinition(name: string, value: unknown): asserts value is EponymeRoleDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`[Eponyme] Custom role "${name}" must be an object.`)
  const definition = value as Partial<EponymeRoleDefinition>
  if (typeof definition.label !== 'string' || !definition.label.trim())
    throw new TypeError(`[Eponyme] Custom role "${name}" needs a label.`)
  if (!Array.isArray(definition.permissions))
    throw new TypeError(`[Eponyme] Custom role "${name}" needs a permissions array.`)

  for (const rule of definition.permissions) {
    if (!rule || (rule.effect !== 'allow' && rule.effect !== 'deny'))
      throw new TypeError(`[Eponyme] Custom role "${name}" has an invalid permission effect.`)
    if (!Array.isArray(rule.actions) || !rule.actions.length
      || rule.actions.some(action => !(EPONYME_PERMISSION_ACTIONS as readonly string[]).includes(action)))
      throw new TypeError(`[Eponyme] Custom role "${name}" has an invalid permission action.`)
    if (rule.effect === 'allow' && rule.actions.some(action => sensitiveActions.has(action)))
      throw new TypeError(`[Eponyme] Custom role "${name}" cannot receive owner-only permissions.`)
    if (!Array.isArray(rule.resources) || !rule.resources.length)
      throw new TypeError(`[Eponyme] Custom role "${name}" has no permission resource.`)
    for (const resource of rule.resources) validatePermissionTarget(name, resource)
  }
}

function validatePermissionTarget(role: string, target: EponymePermissionRule['resources'][number]): void {
  if (!target || !['all', 'singleton', 'collection', 'form', 'folder', 'system'].includes(target.kind))
    throw new TypeError(`[Eponyme] Custom role "${role}" has an invalid permission resource.`)
  if (target.kind === 'all') return
  if (typeof target.name !== 'string' || !target.name.replace(/^\/+|\/+$/g, ''))
    throw new TypeError(`[Eponyme] Custom role "${role}" has an unnamed permission resource.`)
  const name = target.name.replace(/^\/+|\/+$/g, '')
  if (target.kind === 'system') {
    if (!(EPONYME_SYSTEM_RESOURCES as readonly string[]).includes(name))
      throw new TypeError(`[Eponyme] Custom role "${role}" references unknown system resource "${name}".`)
    return
  }
  const schemas = getEponymeSchemas(config)
  const collections = getEponymeCollections(config)
  const forms = getEponymeForms(config)
  const exists = target.kind === 'singleton'
    ? Boolean(schemas[name])
    : target.kind === 'collection'
      ? Boolean(collections[name])
      : target.kind === 'form'
        ? Boolean(forms[name])
        : [...Object.keys(schemas), ...Object.keys(collections), ...Object.keys(forms)]
            .some(resource => resource.startsWith(`${name}/`))
  if (!exists)
    throw new TypeError(`[Eponyme] Custom role "${role}" references unknown ${target.kind} "${name}".`)
}

function allow(
  actions: readonly EponymePermissionAction[],
  resources: EponymePermissionRule['resources'],
): EponymePermissionRule {
  return { effect: 'allow', actions: [...actions], resources }
}
