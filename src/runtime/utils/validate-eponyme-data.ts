import type { EponymeSchema, FieldDefinition, FieldValidator } from '../types'
import { isArrayItemFieldDefinition } from './get-field-default-value'
import { isFieldVisible } from './is-field-visible'
import { normalizeEponymePhone } from './normalize-phone'

/**
 * Errors are keyed by the path of the field they belong to — `title`, `hero.title`,
 * `items.0.title` — so the editor can show each message on the field that produced it.
 * `_form` carries errors about the payload as a whole.
 */
export type ValidationErrors = Record<string, string[]>
export type ValidationMode = 'draft' | 'publish'

const urlPattern = /^https?:\/\//i
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const colorPattern = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function createErrors(): ValidationErrors {
  // Null prototype so a field named `__proto__` cannot collide with Object.prototype.
  return Object.create(null) as ValidationErrors
}

function addError(errors: ValidationErrors, path: string, message: string) {
  (errors[path] ??= []).push(message)
}

/** Number of messages recorded for `path` itself and anything nested under it. */
function countErrorsUnder(errors: ValidationErrors, path: string) {
  const prefix = `${path}.`
  return Object.entries(errors)
    .filter(([key]) => key === path || key.startsWith(prefix))
    .reduce((total, [, messages]) => total + messages.length, 0)
}

function validateField(
  path: string,
  definition: FieldDefinition,
  value: unknown,
  errors: ValidationErrors,
  mode: ValidationMode,
  context: Record<string, unknown>,
) {
  if (!isFieldVisible(definition.options, context)) return
  const errorsBefore = countErrorsUnder(errors, path)
  validateFieldRules(path, definition, value, errors, mode, context)
  if (countErrorsUnder(errors, path) !== errorsBefore || value === undefined || value === null || !definition.options.validate) return

  try {
    const result = (definition.options.validate as FieldValidator<unknown>)(value, context)
    if (typeof result === 'string') addError(errors, path, result)
    else if (Array.isArray(result)) result.forEach(message => addError(errors, path, message))
  }
  catch {
    addError(errors, path, 'Custom validation failed.')
  }
}

function validateFieldRules(
  name: string,
  definition: FieldDefinition,
  value: unknown,
  errors: ValidationErrors,
  mode: ValidationMode,
  _context: Record<string, unknown>,
) {
  const { options } = definition

  if (value === undefined || value === null) {
    if (mode === 'publish' && options.required) addError(errors, name, 'This field is required.')
    return
  }

  if (definition.type === 'section') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      addError(errors, name, 'Must be an object.')
      return
    }
    const sectionData = value as Record<string, unknown>
    for (const sectionField of Object.keys(sectionData)) {
      if (!definition.options.fields[sectionField]) addError(errors, `${name}.${sectionField}`, 'Unknown field.')
    }
    for (const [sectionField, sectionDefinition] of Object.entries(definition.options.fields))
      validateField(`${name}.${sectionField}`, sectionDefinition, sectionData[sectionField], errors, mode, sectionData)
    return
  }

  if (definition.type === 'tabs') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      addError(errors, name, 'Must be an object.')
      return
    }
    const tabsData = value as Record<string, unknown>
    for (const tabName of Object.keys(tabsData)) {
      if (!definition.options.tabs[tabName]) addError(errors, `${name}.${tabName}`, 'Unknown tab.')
    }
    for (const [tabName, tabDefinition] of Object.entries(definition.options.tabs)) {
      const tabValue = tabsData[tabName]
      if (!tabValue || typeof tabValue !== 'object' || Array.isArray(tabValue)) {
        addError(errors, `${name}.${tabName}`, 'Must be an object.')
        continue
      }
      const tabData = tabValue as Record<string, unknown>
      for (const tabField of Object.keys(tabData)) {
        if (!tabDefinition.fields[tabField]) addError(errors, `${name}.${tabName}.${tabField}`, 'Unknown field.')
      }
      for (const [tabField, fieldDefinition] of Object.entries(tabDefinition.fields))
        validateField(`${name}.${tabName}.${tabField}`, fieldDefinition, tabData[tabField], errors, mode, tabData)
    }
    return
  }

  if (definition.type === 'checkboxGroup') {
    if (!Array.isArray(value)) {
      addError(errors, name, 'Must be an array.')
      return
    }
    if (mode === 'publish' && definition.options.required && value.length === 0) addError(errors, name, 'This field is required.')
    if (mode === 'publish' && definition.options.minItems !== undefined && value.length < definition.options.minItems) addError(errors, name, `Must contain at least ${definition.options.minItems} items.`)
    if (definition.options.maxItems !== undefined && value.length > definition.options.maxItems) addError(errors, name, `Must contain at most ${definition.options.maxItems} items.`)
    if (value.some(item => typeof item !== 'string' || !definition.options.options.some(option => option.value === item)))
      addError(errors, name, 'Must contain only available options.')
    return
  }

  if (definition.type === 'array') {
    if (!Array.isArray(value)) {
      addError(errors, name, 'Must be an array.')
      return
    }
    if (mode === 'publish' && options.required && value.length === 0) addError(errors, name, 'This field is required.')
    if (mode === 'publish' && definition.options.minItems !== undefined && value.length < definition.options.minItems) addError(errors, name, `Must contain at least ${definition.options.minItems} items.`)
    if (definition.options.maxItems !== undefined && value.length > definition.options.maxItems) addError(errors, name, `Must contain at most ${definition.options.maxItems} items.`)
    value.forEach((item, index) => {
      if (!isArrayItemFieldDefinition(definition.options.of)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          addError(errors, `${name}.${index}`, 'Must be an object.')
          return
        }
        const itemData = item as Record<string, unknown>
        for (const itemField of Object.keys(itemData)) {
          if (!definition.options.of[itemField]) addError(errors, `${name}.${index}.${itemField}`, 'Unknown field.')
        }
        for (const [itemField, itemDefinition] of Object.entries(definition.options.of))
          validateField(`${name}.${index}.${itemField}`, itemDefinition, itemData[itemField], errors, mode, itemData)
        return
      }
      validateField(`${name}.${index}`, definition.options.of, item, errors, mode, {})
    })
    return
  }

  if (definition.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      addError(errors, name, 'Must be a number.')
      return
    }
    if (definition.options.min !== undefined && value < definition.options.min) addError(errors, name, `Must be at least ${definition.options.min}.`)
    if (definition.options.max !== undefined && value > definition.options.max) addError(errors, name, `Must be at most ${definition.options.max}.`)
    return
  }

  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') addError(errors, name, 'Must be a boolean.')
    return
  }

  if (definition.type === 'url') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      addError(errors, name, 'Must be a link.')
      return
    }
    const link = value as Record<string, unknown>
    if (
      typeof link.href !== 'string'
      || !['internal', 'external'].includes(String(link.type))
      || typeof link.openInNewTab !== 'boolean'
      || (link.download !== undefined && typeof link.download !== 'boolean')
    ) {
      addError(errors, name, 'Must be a valid link.')
      return
    }
    const href = link.href.trim()
    if (mode === 'publish' && options.required && !href) addError(errors, name, 'This field is required.')
    if (!href) return
    if (link.type === 'external' && !isAllowedProtocol(href, definition.options.protocols)) {
      const allowed = normalizeProtocols(definition.options.protocols)
      addError(errors, name, isDefaultProtocols(definition.options.protocols)
        ? 'External links must be HTTP(S) URLs.'
        : `External links must start with ${allowed.map(protocol => `${protocol}:`).join(' or ')}.`)
    }
    if (link.type === 'internal' && !href.startsWith('/') && !href.startsWith('#')) addError(errors, name, 'Internal links must start with / or #.')
    return
  }

  if (typeof value !== 'string') {
    addError(errors, name, 'Must be a string.')
    return
  }

  const normalized = value.trim()
  const normalizedContent = definition.type === 'richText' ? getRichTextContent(normalized) : normalized
  if (mode === 'publish' && options.required && !normalizedContent) addError(errors, name, 'This field is required.')
  if (mode === 'draft' && !normalizedContent) return
  if (definition.type === 'image' && normalized && !urlPattern.test(normalized)) addError(errors, name, 'Must be an HTTP(S) URL.')
  if (definition.type === 'image') return

  if (definition.type === 'select' || definition.type === 'radio') {
    if (normalized && !definition.options.options.some(option => option.value === value)) addError(errors, name, 'Must be one of the available options.')
    return
  }

  if (definition.type === 'date') {
    const timestamp = Date.parse(`${normalized}T00:00:00Z`)
    const isValid = datePattern.test(normalized) && !Number.isNaN(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === normalized
    if (normalized && !isValid) addError(errors, name, 'Must be a valid date.')
    if (definition.options.min && normalized < definition.options.min) addError(errors, name, `Must be on or after ${definition.options.min}.`)
    if (definition.options.max && normalized > definition.options.max) addError(errors, name, `Must be on or before ${definition.options.max}.`)
    return
  }

  if (definition.type === 'phone') {
    const phone = normalizeEponymePhone(normalized, definition.options)
    if (normalized && phone.countryNotAllowed) {
      const accepted = definition.options.countries?.join(', ')
      addError(errors, name, phone.country
        ? `Numbers from ${phone.country} are not accepted. Use a number from: ${accepted}.`
        : `Must be a number from: ${accepted}.`)
    }
    else if (normalized && !phone.valid) {
      addError(errors, name, definition.options.detectCountry === false
        ? 'Must be a valid phone number in international format, starting with the country code.'
        : 'Must be a valid phone number.')
    }
    return
  }

  if (definition.type === 'color') {
    if (normalized && !colorPattern.test(normalized)) addError(errors, name, 'Must be a valid hex color.')
    return
  }

  if (definition.type === 'slug') {
    if (normalized && !slugPattern.test(normalized)) addError(errors, name, 'Must contain only lowercase letters, numbers and single hyphens.')
    if (mode === 'publish' && definition.options.minLength !== undefined && value.length < definition.options.minLength) addError(errors, name, `Must contain at least ${definition.options.minLength} characters.`)
    if (definition.options.maxLength !== undefined && value.length > definition.options.maxLength) addError(errors, name, `Must contain at most ${definition.options.maxLength} characters.`)
    return
  }

  if (definition.type === 'richText') {
    if (mode === 'publish' && definition.options.minLength !== undefined && normalizedContent.length < definition.options.minLength) addError(errors, name, `Must contain at least ${definition.options.minLength} characters.`)
    if (definition.options.maxLength !== undefined && normalizedContent.length > definition.options.maxLength) addError(errors, name, `Must contain at most ${definition.options.maxLength} characters.`)
    return
  }

  if (mode === 'publish' && definition.options.minLength !== undefined && value.length < definition.options.minLength) addError(errors, name, `Must contain at least ${definition.options.minLength} characters.`)
  if (definition.options.maxLength !== undefined && value.length > definition.options.maxLength) addError(errors, name, `Must contain at most ${definition.options.maxLength} characters.`)
  if (definition.options.regex && !definition.options.regex.test(value)) addError(errors, name, 'Has an invalid format.')
  const [localPart, domain, ...extraParts] = normalized.split('@')
  if (definition.type === 'email' && normalized && (!localPart || !domain?.includes('.') || extraParts.length)) addError(errors, name, 'Must be a valid email address.')
}

const DEFAULT_URL_PROTOCOLS = ['http', 'https']
/** `mailto:` and `tel:` carry no `//`, so the scheme is read rather than the whole prefix. */
const schemePattern = /^([a-z][a-z0-9+.-]*):/i

function normalizeProtocols(protocols: readonly string[] | undefined): string[] {
  const declared = protocols?.length ? protocols : DEFAULT_URL_PROTOCOLS
  return declared.map(protocol => protocol.trim().toLowerCase().replace(/:.*$/, ''))
}

function isDefaultProtocols(protocols: readonly string[] | undefined): boolean {
  return !protocols?.length
}

function isAllowedProtocol(href: string, protocols: readonly string[] | undefined): boolean {
  const scheme = schemePattern.exec(href)?.[1]?.toLowerCase()
  return Boolean(scheme) && normalizeProtocols(protocols).includes(scheme!)
}

function getRichTextContent(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>|<\/h[1-6]>|<\/li>|<\/blockquote>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function validateEponymePatch(
  schema: EponymeSchema,
  payload: unknown,
  data?: Record<string, unknown>,
  mode: ValidationMode = 'publish',
): ValidationErrors {
  const errors = createErrors()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { _form: ['Body must be an object.'] }
  const context = data ?? payload as Record<string, unknown>

  for (const [name, value] of Object.entries(payload)) {
    const definition = schema[name]
    if (!definition) addError(errors, name, 'Unknown field.')
    else validateField(name, definition, value, errors, mode, context)
  }

  return errors
}

export function validateEponymeData(schema: EponymeSchema, data: Record<string, unknown>, mode: ValidationMode = 'publish'): ValidationErrors {
  const errors = createErrors()
  for (const [name, definition] of Object.entries(schema))
    validateField(name, definition, data[name], errors, mode, data)
  return errors
}
