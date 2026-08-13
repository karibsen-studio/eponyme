/** Development-only example. Production hosts must put `runEponymeSchedule` behind their own auth. */
export default defineEventHandler(async () => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found.' })
  return await runEponymeSchedule()
})
