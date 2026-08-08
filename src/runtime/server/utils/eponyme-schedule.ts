import { useEponymeService } from '../services/eponyme-service'
import { splitEponymeCollectionEntry } from './eponyme-entry'
import { callEponymeHook } from './eponyme-hooks'

/**
 * Materializes due publication dates so history, hooks and cache purges happen. Public
 * visibility itself is computed lazily and remains correct even when this is never called.
 */
export async function runEponymeSchedule(now = new Date()): Promise<{ processed: number }> {
  const service = useEponymeService()
  const transitions = await service.runSchedule(now)
  for (const transition of transitions) {
    await callEponymeHook(
      transition.action === 'publish' ? 'eponyme:entry:published' : 'eponyme:entry:unpublished',
      {
        name: transition.name,
        collection: splitEponymeCollectionEntry(service, transition.name),
        action: transition.action,
        status: transition.status,
        publishedAt: transition.publishedAt,
        scheduledPublishAt: transition.scheduledPublishAt,
        scheduledUnpublishAt: transition.scheduledUnpublishAt,
        data: transition.data,
      },
    )
  }
  return { processed: transitions.length }
}
