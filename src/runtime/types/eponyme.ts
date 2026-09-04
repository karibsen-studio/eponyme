import type { ArrayFieldDefinition, ArrayItemValue, BooleanFieldDefinition, CheckboxGroupFieldDefinition, EmailFieldDefinition, EponymeCustomFieldDefinition, FieldDefinition, MediaPlayerFieldDefinition, MediaPlayerValue, NumberFieldDefinition, PhoneFieldDefinition, RadioFieldDefinition, RelationFieldDefinition, SectionFieldDefinition, SectionValue, SelectFieldDefinition, SlugFieldDefinition, StringFieldDefinition, TabFieldDefinition, TagsFieldDefinition, TagsValueOf, TabsValue, TextareaFieldDefinition, UrlFieldDefinition, UrlValue } from './field'

// Kept here rather than beside the store: the hook contract needs them, and an application typing a Nitro
// plugin should not have to pull the whole store into its program.
export type EponymeAction = 'draft' | 'publish' | 'unpublish' | 'revertToDraft' | 'schedule' | 'unschedule'
export type EponymeStatus = 'draft' | 'published' | 'unpublished'

export type EponymeSchema = Record<string, FieldDefinition>
export interface EponymeCollectionDefinitionBase {
  __eponymeCollection: true
  label?: string
  description?: string
  addLabel?: string
  publication?: boolean
  fields: EponymeSchema
  slugField: string
  titleField: string
}

export interface EponymeCollectionOptions<T extends EponymeSchema = EponymeSchema> {
  label?: string
  description?: string
  /** Replaces the whole text of the create button. Defaults to `+ New <singular label>`. */
  addLabel?: string
  /** Whether entries of this collection offer the publication tab. */
  publication?: boolean
  fields: T
  slugField: keyof T & string
  titleField: keyof T & string
}

export interface EponymeCollectionDefinition<T extends EponymeSchema = EponymeSchema> extends EponymeCollectionOptions<T> {
  __eponymeCollection: true
  fields: T
  slugField: keyof T & string
  titleField: keyof T & string
}

/** A public form only accepts field types a visitor can meaningfully fill in. */
export type EponymeFormFieldDefinition
  = | StringFieldDefinition
    | TextareaFieldDefinition
    | EmailFieldDefinition
    | PhoneFieldDefinition
    | UrlFieldDefinition
    | NumberFieldDefinition
    | BooleanFieldDefinition
    | SelectFieldDefinition
    | RadioFieldDefinition
    | CheckboxGroupFieldDefinition

export type EponymeFormSchema = Record<string, EponymeFormFieldDefinition>

/** `custom` leaves delivery to the host application; `managed` stores the submission. */
export type EponymeFormMode = 'custom' | 'managed'

export interface EponymeFormSubmissionOptions {
  mode?: EponymeFormMode
  /**
   * Whether the dashboard collects submissions a `custom` route stored itself with
   * `storeEponymeFormSubmission()`.
   */
  store?: boolean
  /** Maximum retained rows for this form. `false` disables the cap. @default 10000 */
  maxStored?: number | false
  /** Delete rows older than this many days. `false` disables age retention. @default 365 */
  retentionDays?: number | false
}

export interface EponymeFormOptions<T extends EponymeFormSchema = EponymeFormSchema> {
  label?: string
  description?: string
  fields: T
  submission?: EponymeFormSubmissionOptions
  /** Name of the trap field bots fill in. `false` disables the check. */
  honeypot?: string | false
  /** In bytes. */
  maxBodyBytes?: number
}

export interface EponymeFormDefinitionBase {
  __eponymeForm: true
  label?: string
  description?: string
  fields: EponymeFormSchema
  submission: Required<EponymeFormSubmissionOptions>
  honeypot: string | false
  maxBodyBytes: number
}

export interface EponymeFormDefinition<T extends EponymeFormSchema = EponymeFormSchema> extends EponymeFormDefinitionBase {
  fields: T
}

export interface EponymeConfig {
  [name: string]: EponymeSchema | EponymeCollectionDefinitionBase | EponymeFormDefinitionBase | EponymeConfig
}

export type CollectionSlugField<T extends EponymeSchema> = {
  [K in keyof T & string]: T[K] extends SlugFieldDefinition ? K : never
}[keyof T & string]

export type FieldValue<T extends FieldDefinition>
  = T extends { type: 'number' | 'duration' } ? number
    : T extends { type: 'boolean' } ? boolean
      : T extends UrlFieldDefinition ? UrlValue
        : T extends MediaPlayerFieldDefinition ? MediaPlayerValue
          : T extends ArrayFieldDefinition<infer Item> ? Array<ArrayItemValue<Item>>
            : T extends CheckboxGroupFieldDefinition<infer Value> ? Value[]
              : T extends RelationFieldDefinition<infer Multiple> ? (Multiple extends true ? string[] : string)
                : T extends TagsFieldDefinition<infer Options> ? Array<TagsValueOf<Options>>
                  : T extends EponymeCustomFieldDefinition<string, infer Value, object> ? Value
                    : T extends SectionFieldDefinition<infer Section> ? SectionValue<Section>
                      : T extends TabFieldDefinition<infer Tabs> ? TabsValue<Tabs>
                        : string

export type EponymeData<T extends EponymeSchema> = {
  [K in keyof T]: T[K] extends FieldDefinition ? FieldValue<T[K]> : never
}

export type EponymeDataByName<
  T extends EponymeConfig,
  Name extends EponymeName<T>,
> = EponymeDataAtPath<T, Name>

export type EponymeCollectionName<T extends EponymeConfig> = {
  [K in keyof T & string]: T[K] extends EponymeCollectionDefinitionBase
    ? K
    : T[K] extends EponymeFormDefinitionBase
      ? never
      : T[K] extends EponymeSchema
        ? never
        : T[K] extends EponymeConfig
          ? `${K}/${EponymeCollectionName<T[K]>}`
          : never
}[keyof T & string]

export type EponymeCollectionDataByName<
  T extends EponymeConfig,
  Name extends EponymeCollectionName<T>,
> = EponymeCollectionAtPath<T, Name> extends EponymeCollectionDefinition<infer Schema> ? EponymeData<Schema> : never

/** Field types a `where` can filter on, mirroring the write path's `INDEXABLE_TYPES`. */
type FilterableFieldType = 'tags' | 'checkboxGroup' | 'select' | 'radio' | 'boolean' | 'date' | 'datetime'

/** A multi-valued field is filtered by one of its items, not by the whole list. */
type FilterOperand<T extends FieldDefinition> = FieldValue<T> extends readonly (infer Item)[] ? Item : FieldValue<T>

/**
 * Bounds, offered only where alphabetical order is the value's natural order - which is `field.date()` and
 * `field.datetime()`, both pinned to chronological strings.
 */
export interface EponymeFilterBounds {
  gte?: string
  lte?: string
  gt?: string
  lt?: string
}

type FilterOperators<T extends FieldDefinition> = {
  /** Any of these, the same as passing the list directly. */
  in?: readonly FilterOperand<T>[]
  /** None of these. Combines with the positive operators to narrow then subtract. */
  not?: FilterOperand<T> | readonly FilterOperand<T>[]
  /** Substring of the stored value, case-insensitive. */
  contains?: string
} & (T extends { type: 'date' | 'datetime' } ? EponymeFilterBounds : unknown)

/** The values of one key are ORed; the keys of a `where` are ANDed. */
export type EponymeFieldFilter<T extends FieldDefinition>
  = FilterOperand<T> | readonly FilterOperand<T>[] | FilterOperators<T>

/** The filter a schema accepts, keyed by field name. */
export type EponymeFilterInput<T extends EponymeSchema> = {
  [K in keyof T as T[K] extends { type: FilterableFieldType } ? K : never]?: T[K] extends FieldDefinition ? EponymeFieldFilter<T[K]> : never
}

export type EponymeCollectionFilter<
  T extends EponymeConfig,
  Name extends EponymeCollectionName<T>,
> = EponymeCollectionAtPath<T, Name> extends EponymeCollectionDefinition<infer Schema> ? EponymeFilterInput<Schema> : never

export type EponymeName<T extends EponymeConfig> = {
  [K in keyof T & string]: T[K] extends EponymeCollectionDefinitionBase
    ? never
    : T[K] extends EponymeFormDefinitionBase
      ? never
      : T[K] extends EponymeSchema
        ? K
        : T[K] extends EponymeConfig
          ? `${K}/${EponymeName<T[K]>}`
          : never
}[keyof T & string]

export type EponymeFormName<T extends EponymeConfig> = {
  [K in keyof T & string]: T[K] extends EponymeFormDefinitionBase
    ? K
    : T[K] extends EponymeCollectionDefinitionBase
      ? never
      : T[K] extends EponymeSchema
        ? never
        : T[K] extends EponymeConfig
          ? `${K}/${EponymeFormName<T[K]>}`
          : never
}[keyof T & string]

export type EponymeFormDataByName<
  T extends EponymeConfig,
  Name extends EponymeFormName<T>,
> = EponymeFormAtPath<T, Name> extends EponymeFormDefinition<infer Schema> ? EponymeData<Schema> : never

type EponymeDataAtPath<T extends EponymeConfig, Name extends string> = Name extends `${infer Folder}/${infer Rest}`
  ? Folder extends keyof T
    ? T[Folder] extends EponymeConfig
      ? EponymeDataAtPath<T[Folder], Rest>
      : never
    : never
  : Name extends keyof T
    ? T[Name] extends EponymeSchema
      ? EponymeData<T[Name]>
      : never
    : never

type EponymeCollectionAtPath<T extends EponymeConfig, Name extends string> = Name extends `${infer Folder}/${infer Rest}`
  ? Folder extends keyof T
    ? T[Folder] extends EponymeConfig
      ? EponymeCollectionAtPath<T[Folder], Rest>
      : never
    : never
  : Name extends keyof T
    ? T[Name]
    : never

type EponymeFormAtPath<T extends EponymeConfig, Name extends string> = Name extends `${infer Folder}/${infer Rest}`
  ? Folder extends keyof T
    ? T[Folder] extends EponymeConfig
      ? EponymeFormAtPath<T[Folder], Rest>
      : never
    : never
  : Name extends keyof T
    ? T[Name]
    : never
