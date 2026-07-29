// Exercises the hook contract the way a host application would: a Nitro plugin
// listening on the documented names.
const seen: string[] = []

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('eponyme:entry:beforeSave', (context) => {
    if (context.data?.title === 'reject-me') throw new Error('Rejected by the test hook.')
    // Mutating the payload must change what is written.
    if (context.data?.title === 'amend-me') context.data.title = 'amended by hook'
  })

  nitroApp.hooks.hook('eponyme:entry:saved', context => void seen.push(`saved:${context.name}`))
  nitroApp.hooks.hook('eponyme:entry:published', context => void seen.push(`published:${context.name}:${context.collection?.name ?? '-'}`))
  nitroApp.hooks.hook('eponyme:entry:restored', context => void seen.push(`restored:${context.name}`))
  nitroApp.hooks.hook('eponyme:form:beforeSubmit', (context) => {
    if (context.data?.email === 'blocked@example.com') throw new Error('This address is not allowed.')
  })
  nitroApp.hooks.hook('eponyme:form:submitted', context => void seen.push(`submitted:${context.form}:${Boolean(context.id)}`))

  // A throwing listener on a notification hook must not fail the request.
  nitroApp.hooks.hook('eponyme:entry:saved', () => {
    throw new Error('This listener always throws.')
  })

  nitroApp.router.get('/_hooks', defineEventHandler(() => ({ seen })))
})
