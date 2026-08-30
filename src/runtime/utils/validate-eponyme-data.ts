import { locale, t } from '#eponyme/locale'
import type { EponymeSchema, FieldDefinition, FieldValidator, MediaPlayerFieldOptions, MediaPlayerProvider } from '../types'
import type { EponymeMessageKey } from '../locales'
import { isArrayItemFieldDefinition } from './get-field-default-value'
import { isFieldVisible } from './is-field-visible'
import { eponymeImageSourceError, isEponymeImageSourceAllowed } from './image-source-message'
import { MEDIA_PLAYER_PROVIDERS, mediaPlayerProviders, parseEponymeMediaUrl } from './media-player'
import { normalizeEponymePhone } from '#eponyme/phone'
import { normalizeEponymeTags } from './normalize-tags'
import { normalizeEponymeDateTime } from './datetime'
import { getEponymeCustomFieldType } from './eponyme-custom-field'

/**
 * Errors are keyed by the path of the field they belong to – `title`, `hero.title`,
 * `items.0.title` – so the editor can show each message on the field that produced it.
 * `_form` carries errors about the payload as a whole.
 */
export type ValidationErrors = Record<string, string[]>
export type ValidationMode = 'draft' | 'publish'

const assetPattern = /^(?:https?:\/\/|\/(?!\/))/i
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
    addError(errors, path, t('field.custom'))
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
    if (mode === 'publish' && options.required) addError(errors, name, t('field.required'))
    return
  }

  if (definition.type === 'custom') {
    try {
      const result = getEponymeCustomFieldType(definition.name).validate(value, definition.options, _context)
      if (typeof result === 'string') addError(errors, name, result)
      else if (Array.isArray(result)) result.forEach(message => addError(errors, name, message))
    }
    catch {
      addError(errors, name, t('field.custom'))
    }
    return
  }

  if (definition.type === 'section') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      addError(errors, name, t('field.object'))
      return
    }
    const sectionData = value as Record<string, unknown>
    for (const sectionField of Object.keys(sectionData)) {
      if (!Object.hasOwn(definition.options.fields, sectionField)) addError(errors, `${name}.${sectionField}`, t('field.unknown'))
    }
    for (const [sectionField, sectionDefinition] of Object.entries(definition.options.fields))
      validateField(`${name}.${sectionField}`, sectionDefinition, sectionData[sectionField], errors, mode, sectionData)
    return
  }

  if (definition.type === 'tabs') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      addError(errors, name, t('field.object'))
      return
    }
    const tabsData = value as Record<string, unknown>
    for (const tabName of Object.keys(tabsData)) {
      if (!Object.hasOwn(definition.options.tabs, tabName)) addError(errors, `${name}.${tabName}`, t('field.unknownTab'))
    }
    for (const [tabName, tabDefinition] of Object.entries(definition.options.tabs)) {
      const tabValue = tabsData[tabName]
      if (!tabValue || typeof tabValue !== 'object' || Array.isArray(tabValue)) {
        addError(errors, `${name}.${tabName}`, t('field.object'))
        continue
      }
      const tabData = tabValue as Record<string, unknown>
      for (const tabField of Object.keys(tabData)) {
        if (!Object.hasOwn(tabDefinition.fields, tabField)) addError(errors, `${name}.${tabName}.${tabField}`, t('field.unknown'))
      }
      for (const [tabField, fieldDefinition] of Object.entries(tabDefinition.fields))
        validateField(`${name}.${tabName}.${tabField}`, fieldDefinition, tabData[tabField], errors, mode, tabData)
    }
    return
  }

  if (definition.type === 'tags') {
    if (!Array.isArray(value)) {
      addError(errors, name, t('field.array'))
      return
    }
    const tags = normalizeEponymeTags(value, definition.options)
    if (mode === 'publish' && options.required && tags.length === 0) addError(errors, name, t('field.required'))
    if (mode === 'publish' && definition.options.minItems !== undefined && tags.length < definition.options.minItems) addError(errors, name, t('field.minItems', { min: definition.options.minItems }))
    if (definition.options.maxItems !== undefined && tags.length > definition.options.maxItems) addError(errors, name, t('field.maxItems', { max: definition.options.maxItems }))
    // Counted on the raw value: a non-string or a blank entry is a bad payload, and normalising
    // silently drops it, so the check has to happen before the dropping is taken as truth.
    if (value.some(item => typeof item !== 'string' || !item.trim())) addError(errors, name, t('field.tagsNotEmpty'))
    const suggestions = definition.options.suggestions
    if (!definition.options.allowCustom && suggestions?.length && tags.some(tag => !suggestions.includes(tag)))
      addError(errors, name, t('field.optionsOnly'))
    return
  }

  if (definition.type === 'checkboxGroup') {
    if (!Array.isArray(value)) {
      addError(errors, name, t('field.array'))
      return
    }
    if (mode === 'publish' && definition.options.required && value.length === 0) addError(errors, name, t('field.required'))
    if (mode === 'publish' && definition.options.minItems !== undefined && value.length < definition.options.minItems) addError(errors, name, t('field.minItems', { min: definition.options.minItems }))
    if (definition.options.maxItems !== undefined && value.length > definition.options.maxItems) addError(errors, name, t('field.maxItems', { max: definition.options.maxItems }))
    if (value.some(item => typeof item !== 'string' || !definition.options.options.some(option => option.value === item)))
      addError(errors, name, t('field.optionsOnly'))
    return
  }

  // Only the shape is checked here: whether the target exists is a question for the database,
  // answered on write by `eponymeRelationRejections`.
  if (definition.type === 'relation') {
    if (definition.options.multiple) {
      if (!Array.isArray(value)) {
        addError(errors, name, t('field.array'))
        return
      }
      if (value.some(item => typeof item !== 'string')) addError(errors, name, t('field.string'))
      if (mode === 'publish' && options.required && value.length === 0) addError(errors, name, t('field.required'))
      if (definition.options.maxItems !== undefined && value.length > definition.options.maxItems)
        addError(errors, name, t('field.maxItems', { max: definition.options.maxItems }))
      return
    }
    if (typeof value !== 'string') {
      addError(errors, name, t('field.string'))
      return
    }
    if (mode === 'publish' && options.required && !value) addError(errors, name, t('field.required'))
    return
  }

  if (definition.type === 'array') {
    if (!Array.isArray(value)) {
      addError(errors, name, t('field.array'))
      return
    }
    if (mode === 'publish' && options.required && value.length === 0) addError(errors, name, t('field.required'))
    if (mode === 'publish' && definition.options.minItems !== undefined && value.length < definition.options.minItems) addError(errors, name, t('field.minItems', { min: definition.options.minItems }))
    if (definition.options.maxItems !== undefined && value.length > definition.options.maxItems) addError(errors, name, t('field.maxItems', { max: definition.options.maxItems }))
    value.forEach((item, index) => {
      if (!isArrayItemFieldDefinition(definition.options.of)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          addError(errors, `${name}.${index}`, t('field.object'))
          return
        }
        const itemData = item as Record<string, unknown>
        for (const itemField of Object.keys(itemData)) {
          if (!Object.hasOwn(definition.options.of, itemField)) addError(errors, `${name}.${index}.${itemField}`, t('field.unknown'))
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
      addError(errors, name, t('field.number'))
      return
    }
    if (definition.options.min !== undefined && value < definition.options.min) addError(errors, name, t('field.min', { min: definition.options.min }))
    if (definition.options.max !== undefined && value > definition.options.max) addError(errors, name, t('field.max', { max: definition.options.max }))
    return
  }

  if (definition.type === 'duration') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      addError(errors, name, t('field.duration'))
      return
    }
    if (definition.options.min !== undefined && value < definition.options.min) addError(errors, name, t('field.durationMin', { min: definition.options.min }))
    if (definition.options.max !== undefined && value > definition.options.max) addError(errors, name, t('field.durationMax', { max: definition.options.max }))
    return
  }

  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') addError(errors, name, t('field.boolean'))
    return
  }

  if (definition.type === 'url') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      addError(errors, name, t('field.link'))
      return
    }
    const link = value as Record<string, unknown>
    if (
      typeof link.href !== 'string'
      || !['internal', 'external'].includes(String(link.type))
      || typeof link.openInNewTab !== 'boolean'
      || (link.download !== undefined && typeof link.download !== 'boolean')
    ) {
      addError(errors, name, t('field.linkInvalid'))
      return
    }
    const href = link.href.trim()
    if (mode === 'publish' && options.required && !href) addError(errors, name, t('field.required'))
    if (!href) return
    if (link.type === 'external' && !isAllowedProtocol(href, definition.options.protocols)) {
      const allowed = normalizeProtocols(definition.options.protocols)
      addError(errors, name, isDefaultProtocols(definition.options.protocols)
        ? t('field.linkHttp')
        : t('field.linkProtocols', { protocols: listDisjunction(allowed.map(protocol => `${protocol}:`)) }))
    }
    if (link.type === 'internal' && !href.startsWith('/') && !href.startsWith('#')) addError(errors, name, t('field.linkInternal'))
    return
  }

  if (definition.type === 'mediaPlayer') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      addError(errors, name, t('field.video'))
      return
    }
    const media = value as Record<string, unknown>
    if (
      typeof media.url !== 'string'
      || (media.id !== undefined && typeof media.id !== 'string')
      || (media.provider !== undefined && media.provider !== '' && !MEDIA_PLAYER_PROVIDERS.includes(media.provider as never))
    ) {
      addError(errors, name, t('field.videoInvalid'))
      return
    }
    const address = media.url.trim()
    if (mode === 'publish' && options.required && !address) addError(errors, name, t('field.required'))
    if (!address) return
    // Read from the address rather than from what the payload claims: the provider is
    // detected, so a value naming one the URL does not match is not a value at all.
    const parsed = parseEponymeMediaUrl(address, definition.options)
    if (!parsed.provider) addError(errors, name, mediaPlayerError(definition.options))
    return
  }

  if (typeof value !== 'string') {
    addError(errors, name, t('field.string'))
    return
  }

  const normalized = value.trim()
  const normalizedContent = definition.type === 'richText' ? getRichTextContent(normalized) : normalized
  if (mode === 'publish' && options.required && !normalizedContent) addError(errors, name, t('field.required'))
  if (mode === 'draft' && !normalizedContent) return
  if (definition.type === 'image' || definition.type === 'file') {
    if (normalized && !assetPattern.test(normalized)) {
      addError(errors, name, t(definition.type === 'image' ? 'field.image' : 'field.file'))
      return
    }
    // An address that parses can still be one this field does not take: a picture restricted to
    // the media library must refuse a link to somebody else's server.
    const sources = definition.type === 'image' ? definition.options.sources : undefined
    if (normalized && !isEponymeImageSourceAllowed(normalized, sources) && sources)
      addError(errors, name, eponymeImageSourceError(sources))
    return
  }

  if (definition.type === 'select' || definition.type === 'radio') {
    if (normalized && !definition.options.options.some(option => option.value === value)) addError(errors, name, t('field.option'))
    return
  }

  if (definition.type === 'date') {
    const timestamp = Date.parse(`${normalized}T00:00:00Z`)
    const isValid = datePattern.test(normalized) && !Number.isNaN(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === normalized
    if (normalized && !isValid) addError(errors, name, t('field.date'))
    if (definition.options.min && normalized < definition.options.min) addError(errors, name, t('field.dateMin', { min: definition.options.min }))
    if (definition.options.max && normalized > definition.options.max) addError(errors, name, t('field.dateMax', { max: definition.options.max }))
    return
  }

  if (definition.type === 'datetime') {
    const canonical = normalizeEponymeDateTime(normalized)
    if (normalized && canonical === null) addError(errors, name, t('field.datetime'))
    if (canonical && definition.options.min && canonical < definition.options.min) addError(errors, name, t('field.datetimeMin', { min: definition.options.min }))
    if (canonical && definition.options.max && canonical > definition.options.max) addError(errors, name, t('field.datetimeMax', { max: definition.options.max }))
    return
  }

  if (definition.type === 'phone') {
    const phone = normalizeEponymePhone(normalized, definition.options)
    if (normalized && phone.countryNotAllowed) {
      const accepted = definition.options.countries?.join(', ')
      addError(errors, name, phone.country
        ? t('field.phoneCountry', { country: phone.country, accepted: accepted })
        : t('field.phoneCountries', { accepted: accepted }))
    }
    else if (normalized && !phone.valid) {
      addError(errors, name, definition.options.detectCountry === false
        ? t('field.phoneInternational')
        : t('field.phone'))
    }
    return
  }

  if (definition.type === 'color') {
    if (normalized && !colorPattern.test(normalized)) addError(errors, name, t('field.color'))
    return
  }

  if (definition.type === 'slug') {
    if (normalized && !slugPattern.test(normalized)) addError(errors, name, t('field.slug'))
    if (mode === 'publish' && definition.options.minLength !== undefined && value.length < definition.options.minLength) addError(errors, name, t('field.minLength', { min: definition.options.minLength }))
    if (definition.options.maxLength !== undefined && value.length > definition.options.maxLength) addError(errors, name, t('field.maxLength', { max: definition.options.maxLength }))
    return
  }

  if (definition.type === 'richText') {
    if (mode === 'publish' && definition.options.minLength !== undefined && normalizedContent.length < definition.options.minLength) addError(errors, name, t('field.minLength', { min: definition.options.minLength }))
    if (definition.options.maxLength !== undefined && normalizedContent.length > definition.options.maxLength) addError(errors, name, t('field.maxLength', { max: definition.options.maxLength }))
    return
  }

  if (mode === 'publish' && definition.options.minLength !== undefined && value.length < definition.options.minLength) addError(errors, name, t('field.minLength', { min: definition.options.minLength }))
  if (definition.options.maxLength !== undefined && value.length > definition.options.maxLength) addError(errors, name, t('field.maxLength', { max: definition.options.maxLength }))
  if (definition.options.regex && !definition.options.regex.test(value)) addError(errors, name, t('field.pattern'))
  const [localPart, domain, ...extraParts] = normalized.split('@')
  if (definition.type === 'email' && normalized && (!localPart || !domain?.includes('.') || extraParts.length)) addError(errors, name, t('field.email'))
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

const MEDIA_PLAYER_LABELS: Record<MediaPlayerProvider, EponymeMessageKey> = {
  youtube: 'field.videoYoutube',
  vimeo: 'field.videoVimeo',
  vkvideo: 'field.videoVkvideo',
  url: 'field.videoUrl',
}

/**
 * "a, b or c" – the joining word belongs to the language, not to the message, so it comes
 * from `Intl` rather than from a hardcoded ` or `.
 */
function listDisjunction(items: string[]): string {
  return new Intl.ListFormat(locale.code, { type: 'disjunction' }).format(items)
}

function mediaPlayerError(options: MediaPlayerFieldOptions) {
  const accepted = mediaPlayerProviders(options).map(provider => t(MEDIA_PLAYER_LABELS[provider]))
  return t('field.videoProviders', { providers: listDisjunction(accepted) })
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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { _form: [t('form.body')] }
  const context = data ?? payload as Record<string, unknown>

  for (const [name, value] of Object.entries(payload)) {
    const definition = Object.hasOwn(schema, name) ? schema[name] : undefined
    if (!definition) addError(errors, name, t('field.unknown'))
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
