/** Development-only example. Production hosts must put `runEponymeSchedule` behind their own auth. */
export default defineEventHandler(async () => {
  if (!import.meta.dev) throw createError({ status: 404, message: 'Not found.' })
  return await runEponymeSchedule()
})
