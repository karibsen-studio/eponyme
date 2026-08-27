import type {
  EponymePermissionAction,
  EponymePermissionRule,
  EponymePermissionTarget,
  EponymeResource,
} from '../types/permissions'

export function canEponyme(
  rules: readonly EponymePermissionRule[],
  action: EponymePermissionAction,
  resource: EponymeResource,
): boolean {
  const matching = rules.filter(rule => rule.actions.includes(action)
    && rule.resources.some(target => matchesEponymeResource(target, resource)))
  if (matching.some(rule => rule.effect === 'deny')) return false
  return matching.some(rule => rule.effect === 'allow')
}

export function matchesEponymeResource(
  target: EponymePermissionTarget,
  resource: EponymeResource,
): boolean {
  // `all` and `folder` both describe content, so a system feature is only ever granted by
  // naming it: a content folder called `media` cannot open the media library.
  if (resource.kind === 'system' && target.kind !== 'system') return false
  if (target.kind === 'all') return true
  if (target.kind === 'folder') {
    const folder = normalizeName(target.name)
    const name = normalizeName(resource.name)
    return Boolean(folder) && (name === folder || name.startsWith(`${folder}/`))
  }
  return target.kind === resource.kind && normalizeName(target.name) === normalizeName(resource.name)
}

export function normalizeEponymeResource(resource: EponymeResource): EponymeResource {
  return { kind: resource.kind, name: normalizeName(resource.name) }
}

function normalizeName(value: string | undefined): string {
  return String(value ?? '').replace(/^\/+|\/+$/g, '')
}
