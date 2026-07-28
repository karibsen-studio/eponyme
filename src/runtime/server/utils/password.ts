import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64
const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 128

export function validatePassword(password: unknown): string | undefined {
  if (typeof password !== 'string') return 'Password is required.'
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must contain at most ${PASSWORD_MAX_LENGTH} characters.`
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer
  return `scrypt$${salt}$${derived.toString('base64url')}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, expectedValue] = encoded.split('$')
  if (algorithm !== 'scrypt' || !salt || !expectedValue) return false

  try {
    const expected = Buffer.from(expectedValue, 'base64url')
    const actual = await scrypt(password, salt, expected.length) as Buffer
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  catch {
    return false
  }
}

export function generateTemporaryPassword(): string {
  return randomBytes(18).toString('base64url')
}
