import { defineEventHandler } from 'h3'
import { getEponymeEventUser } from '../../utils/auth'

export default defineEventHandler(async event => ({
  user: await getEponymeEventUser(event) ?? null,
}))
