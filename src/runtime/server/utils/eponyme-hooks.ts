import { t } from '#eponyme/locale'
import { createError } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import type { EponymeHooks } from '../../types/hooks'

type HookName = keyof EponymeHooks
type HookContext<Name extends HookName> = Parameters<EponymeHooks[Name]>[0]

/**
 * `NitroRuntimeHooks` is augmented for host applications in `types/nuxt.d.ts`, but
 * that augmentation is not in scope while type-checking the module itself.
 */
function hooks() {
  return useNitroApp().hooks as unknown as {
    callHook: (name: HookName, context: unknown) => Promise<void>
  }
}

/**
 * Notification hooks. The write already happened, so a listener that throws is
 * logged and swallowed: a failing webhook must not report a successful save as an
 * error the editor cannot act on.
 */
export async function callEponymeHook<Name extends Exclude<HookName, `${string}before${string}`>>(
  name: Name,
  context: HookContext<Name>,
): Promise<void> {
  try {
    await hooks().callHook(name, context)
  }
  catch (error) {
    console.error(`[Eponyme] The "${name}" hook threw. The operation itself succeeded.`, error)
  }
}

/**
 * Blocking hooks, run before the write. A listener may mutate `context.data` to amend
 * the payload, or throw to reject the operation — the error surfaces as a 422 so the
 * message reaches the editor.
 */
export async function callEponymeBlockingHook<Name extends Extract<HookName, `${string}before${string}`>>(
  name: Name,
  context: HookContext<Name>,
): Promise<void> {
  try {
    await hooks().callHook(name, context)
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 422,
      statusMessage: error instanceof Error ? error.message : t('server.hookRejected', { hook: name }),
      data: { errors: { _form: [error instanceof Error ? error.message : 'Rejected by a server hook.'] } },
    })
  }
}
