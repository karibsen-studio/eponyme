import { t } from '#eponyme/locale'
import { createError, defineEventHandler, setResponseHeader, setResponseStatus } from 'h3'
import { useEponymeFormService } from '../../services/eponyme-form-service'
import { readEponymeFormRoute } from '../../utils/form-route'
import { callEponymeBlockingHook, callEponymeHook } from '../../utils/eponyme-hooks'
import { readEponymeRawBody } from '../../utils/body'
import { assertEponymeFormRateLimit } from '../../utils/eponyme-form'

/**
 * The only unauthenticated write route in the module. Order matters: reject an
 * oversized body before parsing it, and answer a normal success to a triggered
 * honeypot so a bot learns nothing from the response.
 */
export default defineEventHandler(async (event) => {
  const route = readEponymeFormRoute(event)
  const service = useEponymeFormService()
  const definition = route && !route.submissions ? service.getForm(route.name) : undefined
  // A `custom` form stores nothing, so it has no submission endpoint at all.
  if (!route || !definition || definition.submission.mode !== 'managed')
    throw createError({ status: 404, message: t('server.formNotFound') })

  setResponseHeader(event, 'Cache-Control', 'no-store')

  await assertEponymeFormRateLimit(event, route.name)

  const raw = await readEponymeRawBody(event, definition.maxBodyBytes, t('server.submissionTooLarge'))

  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : undefined
  }
  catch {
    setResponseStatus(event, 422)
    return { errors: { _form: ['Body must be valid JSON.'] } }
  }

  if (service.isHoneypotTriggered(route.name, payload)) {
    setResponseStatus(event, 201)
    return { submitted: true }
  }

  const validated = service.validate(route.name, payload)
  if (validated && 'errors' in validated) {
    setResponseStatus(event, 422)
    return { errors: validated.errors }
  }

  const beforeSubmit = { form: route.name, data: validated?.data ?? {} }
  await callEponymeBlockingHook('eponyme:form:beforeSubmit', beforeSubmit)

  const result = await service.submit(route.name, beforeSubmit.data)
  if (!result) throw createError({ status: 404, message: t('server.formNotFound') })
  if ('errors' in result) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }

  await callEponymeHook('eponyme:form:submitted', {
    form: route.name,
    data: result.submission.data,
    id: result.submission.id,
  })

  setResponseStatus(event, 201)
  return { submitted: true, id: result.submission.id }
})
