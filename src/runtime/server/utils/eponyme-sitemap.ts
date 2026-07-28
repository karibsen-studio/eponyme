import { useRuntimeConfig } from 'nitropack/runtime'
import { useEponymeService } from '../services/eponyme-service'
import type { EponymeSitemapEntry } from '../services/eponyme-store'

export type { EponymeSitemapEntry }

/**
 * Auto-imported so a Nuxt sitemap integration can build its own route without an
 * internal HTTP request.
 */
export async function getEponymeSitemapEntries(): Promise<EponymeSitemapEntry[]> {
  const runtimeConfig = useRuntimeConfig()
  const previewPaths = (runtimeConfig.public.eponyme as { previewPaths?: Record<string, string> } | undefined)?.previewPaths ?? {}
  return useEponymeService().getSitemapEntries(previewPaths)
}
