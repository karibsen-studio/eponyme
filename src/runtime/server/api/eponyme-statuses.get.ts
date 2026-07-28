import { defineEventHandler } from 'h3'
import { useEponymeService } from '../services/eponyme-service'
import { requireEponymeUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  await requireEponymeUser(event)
  return { statuses: await useEponymeService().statuses() }
})
