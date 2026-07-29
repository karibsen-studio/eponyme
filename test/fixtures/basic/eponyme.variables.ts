import { defineEponymeVariables } from '../../../src/config/variables'

export default defineEponymeVariables({
  clubName: 'Test Club',
  season: {
    label: 'Season',
    value: () => `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  },
})
