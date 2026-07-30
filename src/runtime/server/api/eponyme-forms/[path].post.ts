import { createError, defineEventHandler, getRequestHeader, readRawBody, setResponseHeader, setResponseStatus } from 'h3'
import { useEponymeFormService } from '../../services/eponyme-form-service'
import { readEponymeFormRoute } from '../../utils/form-route'
import { callEponymeBlockingHook, callEponymeHook } from '../../utils/eponyme-hooks'

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
    throw createError({ statusCode: 404, statusMessage: 'Eponyme form not found.' })

  setResponseHeader(event, 'Cache-Control', 'no-store')

  const declaredLength = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > definition.maxBodyBytes)
    throw createError({ statusCode: 413, statusMessage: 'Submission is too large.' })

  const raw = await readRawBody(event, 'utf8')
  if (raw && Buffer.byteLength(raw, 'utf8') > definition.maxBodyBytes)
    throw createError({ statusCode: 413, statusMessage: 'Submission is too large.' })

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

  // Validated next, so a listener never sees a payload the schema would reject.
  const validated = service.validate(route.name, payload)
  if (validated && 'errors' in validated) {
    setResponseStatus(event, 422)
    return { errors: validated.errors }
  }

  const beforeSubmit = { form: route.name, data: validated?.data ?? {} }
  await callEponymeBlockingHook('eponyme:form:beforeSubmit', beforeSubmit)

  const result = await service.submit(route.name, beforeSubmit.data)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Eponyme form not found.' })
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
