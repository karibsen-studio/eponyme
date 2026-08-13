// A route Eponyme does not own, feeding the dashboard's submission list: the host
// decides what to accept, `storeEponymeFormSubmission()` keeps the copy.
export default defineEventHandler(async (event) => {
  // Before the body is read: a limit applied afterwards has already paid for the request.
  await assertEponymeFormRateLimit(event, 'partnership')

  const body = await readBody(event)
  if (body?.company === 'Spam Inc') {
    setResponseStatus(event, 403)
    return { rejected: true }
  }

  const result = await storeEponymeFormSubmission('partnership', body)
  if (result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }
  return { stored: true, id: result.submission.id }
})
