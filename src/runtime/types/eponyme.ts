import type { ArrayFieldDefinition, ArrayItemValue, BooleanFieldDefinition, CheckboxGroupFieldDefinition, EmailFieldDefinition, FieldDefinition, NumberFieldDefinition, RadioFieldDefinition, SectionFieldDefinition, SectionValue, SelectFieldDefinition, SlugFieldDefinition, StringFieldDefinition, TabFieldDefinition, TabsValue, TextareaFieldDefinition, UrlFieldDefinition, UrlValue } from './field'

export type EponymeSchema = Record<string, FieldDefinition>
export interface EponymeCollectionDefinitionBase {
  __eponymeCollection: true
  label?: string
  description?: string
  fields: EponymeSchema
  slugField: string
  titleField: string
}

export interface EponymeCollectionOptions<T extends EponymeSchema = EponymeSchema> {
  label?: string
  description?: string
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

/**
 * A public form only accepts field types a visitor can meaningfully fill in.
 * `slug`, `richText`, `image`, `date`, `color`, `array`, `section` and `tabs` are
 * authoring concerns and are rejected by `form()`.
 */
export type EponymeFormFieldDefinition
  = | StringFieldDefinition
    | TextareaFieldDefinition
    | EmailFieldDefinition
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
  /** Requires a valid captcha token. Needs an adapter such as `@karibsen/eponyme-captcha`. */
  captcha?: boolean
}

export interface EponymeFormDefinitionBase {
  __eponymeForm: true
  label?: string
  description?: string
  fields: EponymeFormSchema
  submission: Required<EponymeFormSubmissionOptions>
  honeypot: string | false
  maxBodyBytes: number
  captcha: boolean
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
  = T extends { type: 'number' } ? number
    : T extends { type: 'boolean' } ? boolean
      : T extends UrlFieldDefinition ? UrlValue
        : T extends ArrayFieldDefinition<infer Item> ? Array<ArrayItemValue<Item>>
          : T extends CheckboxGroupFieldDefinition<infer Value> ? Value[]
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
