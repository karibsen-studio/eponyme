export default {
  name: 'fake',
  async verify(token: string) {
    return token === 'valid-token'
      ? { success: true }
      : { success: false, reason: 'Rejected by the test verifier.' }
  },
}
