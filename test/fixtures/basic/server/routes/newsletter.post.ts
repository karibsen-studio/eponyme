// Exercises the auto-imported server utility a `custom` form relies on: the host
// application owns the route, Eponyme owns the validation.
export default defineEventHandler(async (event) => {
  const result = validateEponymeForm('newsletter', await readBody(event))
  if (result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }
  return { delivered: true, data: result.data }
})
