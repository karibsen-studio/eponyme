import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { useEponymeAuditService } from '../services/eponyme-audit-service'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig().eponymeAudit
  const prune = () => useEponymeAuditService()
    .prune(config.retentionDays, config.pruneIntervalHours)
    .catch(error => console.error('[Eponyme] Audit retention failed.', error))

  void prune()
  const timer = setInterval(() => void prune(), config.pruneIntervalHours * 60 * 60 * 1000)
  timer.unref?.()
})
