import factory from '#eponyme/storage'
import { t } from '#eponyme/locale'
import { createError } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import type { EponymeStorageDriver, EponymeStorageFactory } from '../../types/storage'
import type { EponymeMediaSettings } from '../utils/eponyme-media'

/** Lives here rather than beside the media helpers, which stay free of a runtime to be testable. */
export function useEponymeMediaSettings(): EponymeMediaSettings {
  const { prefix, maxSize, accept } = useRuntimeConfig().eponymeStorage
  return { prefix, maxSize, accept }
}

let driver: EponymeStorageDriver | undefined
let pending: Promise<EponymeStorageDriver> | undefined

export function hasEponymeStorage(): boolean {
  return typeof factory === 'function'
}

/** The configured driver, built once. */
export function useEponymeStorage(): Promise<EponymeStorageDriver> {
  if (driver) return Promise.resolve(driver)
  if (!hasEponymeStorage()) {
    throw createError({ status: 501, message: t('server.storageDisabled') })
  }

  pending ??= (async () => {
    const { accessKeyId, secretAccessKey, sessionToken } = useRuntimeConfig().eponymeStorage
    const credentials = accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) }
      : undefined
    driver = await (factory as EponymeStorageFactory)({ credentials })
    return driver
  })()

  return pending
}

/** Resets the memoised driver. Only useful in tests. */
export function resetEponymeStorage(): void {
  driver = undefined
  pending = undefined
}
