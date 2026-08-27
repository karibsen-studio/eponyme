import type { NumberFieldDefinition, NumberFieldOptions } from '../types/field'
import { number } from './number'

/**
 * Where a currency's symbol sits, and how many decimals it has.
 *
 * `position` follows the convention of the places that use the currency, not one rule applied
 * everywhere: `$12.00` and `12,00 €` are both correct, and swapping either reads as a mistake.
 * `decimals` is the currency's minor unit – yen and won have none, so a step of `0.01` would
 * offer an amount that cannot exist.
 */
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
  /** Overrides which side the symbol sits on. */
  position?: 'prefix' | 'suffix'
}

/**
 * A `field.number()` carrying a currency: the symbol as its adornment, the currency's minor
 * unit as its step.
 *
 * It builds a number rather than declaring a type of its own, so the value stays a plain
 * `number` and every path a number already travels – validation, storage, the schema
 * fingerprint an import is checked against, public forms – is unchanged. Changing a field
 * from `number` to `money` therefore never invalidates an export.
 *
 * `min` is deliberately left alone: an amount can be a discount or a balance, and forcing
 * `min: 0` would refuse a value the author never said was impossible. Declaring it is also
 * what opts the field into the compact numeric keypad on mobile.
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
