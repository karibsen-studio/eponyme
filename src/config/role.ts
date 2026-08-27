import type {
  EponymePermissionAction,
  EponymePermissionRule,
  EponymePermissionTarget,
  EponymeResourceKind,
  EponymeRoleDefinitions,
} from '../runtime/types/permissions'

type OneOrMany<T> = T | readonly T[]

function target(kind: EponymeResourceKind | 'all', name?: string): EponymePermissionTarget {
  return name === undefined ? { kind } : { kind, name }
}

function rule(
  effect: EponymePermissionRule['effect'],
  actions: OneOrMany<EponymePermissionAction>,
  resources: OneOrMany<EponymePermissionTarget>,
): EponymePermissionRule {
  return {
    effect,
    actions: [...(Array.isArray(actions) ? actions : [actions])],
    resources: [...(Array.isArray(resources) ? resources : [resources])],
  }
}

export function defineEponymeRoles<const Roles extends EponymeRoleDefinitions>(roles: Roles): Roles {
  return roles
}

export const permission = {
  allow: (
    actions: OneOrMany<EponymePermissionAction>,
    resources: OneOrMany<EponymePermissionTarget>,
  ) => rule('allow', actions, resources),
  deny: (
    actions: OneOrMany<EponymePermissionAction>,
    resources: OneOrMany<EponymePermissionTarget>,
  ) => rule('deny', actions, resources),
  all: () => target('all'),
  singleton: (name: string) => target('singleton', name),
  collection: (name: string) => target('collection', name),
  form: (name: string) => target('form', name),
  folder: (name: string) => target('folder', name),
  system: (name: 'content' | 'media' | 'users' | 'audit') => target('system', name),
} as const
