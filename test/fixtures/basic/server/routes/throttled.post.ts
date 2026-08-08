// A `custom` route opting into the limits its form would have had on the managed endpoint.
// It stores nothing: the point under test is that the guard runs and eventually refuses.
export default defineEventHandler(async (event) => {
  await assertEponymeFormRateLimit(event, 'throttled')
  return { accepted: true }
})
