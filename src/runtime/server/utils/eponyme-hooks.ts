import { t } from '#eponyme/locale'
import { createError, isError } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import type { EponymeHooks } from '../../types/hooks'
import { useEponymeAuditService } from '../services/eponyme-audit-service'

type HookName = keyof EponymeHooks
type HookContext<Name extends HookName> = Parameters<EponymeHooks[Name]>[0]

/**
 * `NitroRuntimeHooks` is augmented for host applications in `types/nuxt.d.ts`, but that augmentation is not
 * in scope while type-checking the module itself.
 */
function hooks() {
  return useNitroApp().hooks as unknown as {
    callHook: (name: HookName, context: unknown) => Promise<void>
  }
}

/**
 * Notification hooks.
 *
 * Not retried here on purpose: one call reaches every listener of the name, so trying again would re-run
 * the ones that already succeeded - a second webhook, a second email. The failure is recorded instead, and
 * replaying only what failed is what a durable outbox would add.
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
    // Recorded as well as logged: an effect the host never applied - a purge, a webhook - is otherwise
    // invisible to whoever reads the dashboard later.
    await recordHookFailure(name, context, error)
  }
}

async function recordHookFailure(name: string, context: unknown, error: unknown): Promise<void> {
  const entry = (context as { name?: unknown })?.name
  try {
    await useEponymeAuditService().record({
      action: 'hook.failed',
      outcome: 'failure',
      resourceType: 'system',
      resourceName: name,
      metadata: {
        entry: typeof entry === 'string' ? entry : null,
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }
  catch (auditError) {
    // The audit is the last resort, not a second failure to propagate into a successful write.
    console.error('[Eponyme] The hook failure could not be recorded.', auditError)
  }
}

/** Blocking hooks, run before the write. */
export async function callEponymeBlockingHook<Name extends Extract<HookName, `${string}before${string}`>>(
  name: Name,
  context: HookContext<Name>,
): Promise<void> {
  try {
    await hooks().callHook(name, context)
  }
  catch (error) {
    if (isError(error)) throw error
    throw createError({
      status: 422,
      message: error instanceof Error ? error.message : t('server.hookRejected', { hook: name }),
      data: { errors: { _form: [error instanceof Error ? error.message : 'Rejected by a server hook.'] } },
    })
  }
}
