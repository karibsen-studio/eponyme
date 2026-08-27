// A host application only sees the hook names if the module's generated types point at the
// augmentation, so the reference below is the fixture's build output, not the module source.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../fixtures/basic/.nuxt/types/eponyme-augmentations.d.ts" />
import { defineNitroPlugin } from 'nitropack/runtime'
// Imported from the source of the hook contract: `@karibsen/eponyme` re-exports both,
// and pulling the package entry in here would drag its whole field registry along.
import type { EponymeEntryContext, EponymeEntryTrashContext } from '../../src/runtime/types/hooks'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('eponyme:entry:published', (context) => {
    const name: string = context.name
    const slug: string | undefined = context.collection?.slug
    void [name, slug]
  })

  nitroApp.hooks.hook('eponyme:entry:beforeSave', (context) => {
    context.data.title = 'amended'
  })

  nitroApp.hooks.hook('eponyme:form:submitted', ({ form, id, data }) => {
    void `${form} ${id} ${String(data.email)}`
  })

  // The shape the caching guide documents: one handler shared by the entry and trash hooks.
  const purge = (_context: EponymeEntryContext | EponymeEntryTrashContext) => {}
  nitroApp.hooks.hook('eponyme:entry:published', purge)
  nitroApp.hooks.hook('eponyme:entry:trashed', purge)

  // @ts-expect-error a name the module does not emit must not typecheck
  nitroApp.hooks.hook('eponyme:entry:invented', () => {})
})
