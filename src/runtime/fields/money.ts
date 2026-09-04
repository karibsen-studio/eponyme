import type { NumberFieldDefinition, NumberFieldOptions } from '../types/field'
import { number } from './number'

/** Where a currency's symbol sits, and how many decimals it has. */
const CURRENCIES = {
  USD: { symbol: '$', position: 'prefix', decimals: 2 },
  EUR: { symbol: '€', position: 'suffix', decimals: 2 },
  GBP: { symbol: '£', position: 'prefix', decimals: 2 },
  JPY: { symbol: '¥', position: 'prefix', decimals: 0 },
  CNY: { symbol: '¥', position: 'prefix', decimals: 2 },
  KRW: { symbol: '₩', position: 'prefix', decimals: 0 },
  INR: { symbol: '₹', position: 'prefix', decimals: 2 },
  CHF: { symbol: 'CHF', position: 'suffix', decimals: 2 },
  CAD: { symbol: '$', position: 'prefix', decimals: 2 },
  AUD: { symbol: '$', position: 'prefix', decimals: 2 },
  NZD: { symbol: '$', position: 'prefix', decimals: 2 },
  HKD: { symbol: 'HK$', position: 'prefix', decimals: 2 },
  SGD: { symbol: 'S$', position: 'prefix', decimals: 2 },
  SEK: { symbol: 'kr', position: 'suffix', decimals: 2 },
  NOK: { symbol: 'kr', position: 'suffix', decimals: 2 },
  DKK: { symbol: 'kr', position: 'suffix', decimals: 2 },
  PLN: { symbol: 'zł', position: 'suffix', decimals: 2 },
  CZK: { symbol: 'Kč', position: 'suffix', decimals: 2 },
  BRL: { symbol: 'R$', position: 'prefix', decimals: 2 },
  MXN: { symbol: '$', position: 'prefix', decimals: 2 },
  ZAR: { symbol: 'R', position: 'prefix', decimals: 2 },
  TRY: { symbol: '₺', position: 'prefix', decimals: 2 },
  AED: { symbol: 'AED', position: 'suffix', decimals: 2 },
  MAD: { symbol: 'MAD', position: 'suffix', decimals: 2 },
  XOF: { symbol: 'CFA', position: 'suffix', decimals: 0 },
} as const satisfies Record<string, { symbol: string, position: 'prefix' | 'suffix', decimals: number }>

export type EponymeCurrency = keyof typeof CURRENCIES

export interface MoneyFieldOptions extends Omit<NumberFieldOptions, 'prefix' | 'suffix'> {
  /** Defaults to `EUR`. */
  currency?: EponymeCurrency
  /** Overrides the symbol, for a currency the table does not carry. */
  symbol?: string
  position?: 'prefix' | 'suffix'
}

/**
 * A `field.number()` carrying a currency: the symbol as its adornment, the currency's minor unit as its
 * step.
 */
export function money(options: MoneyFieldOptions = {}): NumberFieldDefinition {
  const { currency = 'EUR', symbol, position, ...rest } = options
  const preset = CURRENCIES[currency]
  const resolved = symbol ?? preset.symbol
  const side = position ?? preset.position

  return number({
    step: 1 / 10 ** preset.decimals,
    ...rest,
    [side]: resolved,
  })
}
