import type { FetchError } from 'ofetch'

export interface EponymeErrorBody {
  message?: string
}

export function getEponymeErrorBody<T extends object = Record<string, never>>(error: unknown): (EponymeErrorBody & T) | undefined {
  return (error as FetchError<EponymeErrorBody & T> | undefined)?.data
}

export function getEponymeErrorMessage(error: unknown, fallback: string): string {
  return getEponymeErrorBody(error)?.message || fallback
}
