// `newsletter` declares no `store`, so collecting it has to fail loudly rather than
// drop the submission on the floor.
export default defineEventHandler(async (event) => {
  await storeEponymeFormSubmission('newsletter', await readBody(event))
  return { stored: true }
})
