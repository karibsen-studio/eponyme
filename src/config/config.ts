import type { EponymeConfig } from '../runtime/types'

export function defineEponymeConfig<const T extends EponymeConfig>(config: T): T {
  return config
}
