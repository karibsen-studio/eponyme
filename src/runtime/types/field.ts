import type { CountryCode } from 'libphonenumber-js/min'

export type EponymeFieldType = 'string' | 'slug' | 'email' | 'phone' | 'url' | 'mediaPlayer' | 'textarea' | 'richText' | 'number' | 'boolean' | 'file' | 'image' | 'select' | 'radio' | 'checkboxGroup' | 'tags' | 'date' | 'datetime' | 'duration' | 'color' | 'custom' | 'array' | 'section' | 'tabs'

export type FieldVisibilityCondition
  = | { field: string, equals: unknown, notEquals?: never }
    | { field: string, notEquals: unknown, equals?: never }

export type FieldValidationResult = true | string | string[] | null | undefined
export type FieldValidator<T> = {
  bivarianceHack(value: T, data: Readonly<Record<string, unknown>>): FieldValidationResult
}['bivarianceHack']

export interface DefaultFieldOptions<T> {
  label?: string
  description?: string
  required?: boolean
  defaultValue?: T
  visibleWhen?: FieldVisibilityCondition | FieldVisibilityCondition[]
  validate?: FieldValidator<T>
}

// Filled by the type template generated from eponyme/fields.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EponymeCustomFieldValues {}

export type EponymeCustomFieldOptions<Value, Options extends object>
  = DefaultFieldOptions<Value> & Options

export interface EponymeCustomFieldTypeDefinition<Value, Options extends object = Record<string, never>> {
  defaultValue: Value
  normalize?: (value: unknown, options: Readonly<EponymeCustomFieldOptions<Value, Options>>) => unknown
  validate: (
    value: unknown,
    options: Readonly<EponymeCustomFieldOptions<Value, Options>>,
    data: Readonly<Record<string, unknown>>,
  ) => FieldValidationResult
}

export type InferEponymeCustomFieldValue<Definition>
  = Definition extends EponymeCustomFieldTypeDefinition<infer Value, object> ? Value : unknown

export type InferEponymeCustomFieldOptions<Definition>
  = Definition extends EponymeCustomFieldTypeDefinition<unknown, infer Options> ? Options : Record<string, unknown>

export interface EponymeCustomFieldDefinition<
  Name extends string = string,
  Value = Name extends keyof EponymeCustomFieldValues ? EponymeCustomFieldValues[Name] : unknown,
  Options extends object = Record<string, unknown>,
> {
  type: 'custom'
  name: Name
  options: EponymeCustomFieldOptions<Value, Options>
}

export interface EponymeCustomFieldComponentProps<Value = unknown, Options extends object = Record<string, unknown>> {
  id: string
  modelValue?: Value
  label: string
  description?: string
  required?: boolean
  errors?: string[]
  disabled?: boolean
  options: Readonly<EponymeCustomFieldOptions<Value, Options>>
}

export interface TextFieldOptions extends DefaultFieldOptions<string> {
  minLength?: number
  maxLength?: number
  showCounter?: boolean
  placeholder?: string
  trim?: boolean
  regex?: RegExp
  mask?: string
}

export type StringFieldOptions = TextFieldOptions
export type TextareaFieldOptions = TextFieldOptions

export interface StringFieldDefinition {
  type: 'string'
  options: StringFieldOptions
}

export interface SlugFieldOptions extends DefaultFieldOptions<string> {
  minLength?: number
  maxLength?: number
  showCounter?: boolean
  placeholder?: string
}

export interface SlugFieldDefinition {
  type: 'slug'
  options: SlugFieldOptions
}

export interface TextareaFieldDefinition {
  type: 'textarea'
  options: TextareaFieldOptions
}

export interface RichTextFieldOptions extends DefaultFieldOptions<string> {
  minLength?: number
  maxLength?: number
  showCounter?: boolean
  placeholder?: string
}

export interface RichTextFieldDefinition {
  type: 'richText'
  options: RichTextFieldOptions
}

export type EmailFieldOptions = TextFieldOptions

export interface EmailFieldDefinition {
  type: 'email'
  options: EmailFieldOptions
}

/**
 * Countries a phone field accepts, as ISO 3166-1 alpha-2 codes. Re-exported so declaring a
 * field autocompletes them without importing from `libphonenumber-js` in application code.
 */
export type PhoneCountry = CountryCode

export interface PhoneFieldOptions extends DefaultFieldOptions<string> {
  placeholder?: string
  /**
   * Countries whose numbers are accepted. A number resolving to any other country is refused.
   * Omitted, every country is accepted.
   */
  countries?: PhoneCountry[]
  /**
   * Country a number typed without an international prefix belongs to. Without it, only
   * `+…` numbers can be understood.
   */
  defaultCountry?: PhoneCountry
  /**
   * Whether a number may be written in national form and resolved against `defaultCountry`.
   * `false` requires the international `+…` form, so the country is never guessed.
   *
   * @default true
   */
  detectCountry?: boolean
  /** Value of the input's `autocomplete` attribute. */
  autocomplete?: 'tel' | 'tel-national' | 'tel-country-code'
}

export interface PhoneFieldDefinition {
  type: 'phone'
  options: PhoneFieldOptions
}

export type UrlType = 'internal' | 'external'

export interface UrlValue {
  href: string
  type: UrlType
  openInNewTab: boolean
  download?: boolean
}

/**
 * Scheme of an external link, without the trailing colon. The common ones are suggested, and
 * any other scheme is still accepted – `bitcoin`, `matrix` or an application scheme are valid
 * choices this list has no business refusing.
 */
export type UrlProtocol = 'http' | 'https' | 'mailto' | 'tel' | 'sms' | 'ftp' | (string & {})

export interface UrlFieldOptions extends DefaultFieldOptions<UrlValue> {
  placeholder?: string
  /**
   * Schemes an external link may use. `['https']` refuses plain `http`, and adding `mailto`
   * or `tel` is what makes a contact link possible.
   *
   * Internal links are unaffected: they still have to start with `/` or `#`.
   *
   * @default ['http', 'https']
   */
  protocols?: UrlProtocol[]
}

export interface UrlFieldDefinition {
  type: 'url'
  options: UrlFieldOptions
}

/**
 * Where a video comes from. `YouTube` and `vimeo` are embedded in an iframe; `url` is a file
 * the browser plays directly in a `<video>` element.
 */
export type MediaPlayerProvider = 'youtube' | 'vimeo' | 'vkvideo' | 'url'

export interface MediaPlayerValue {
  /** Detected from `url`. Empty while nothing has been entered, or when nothing recognized it. */
  provider: MediaPlayerProvider | ''
  /** Address as it was entered. */
  url: string
  /** Video id at its provider. Empty for `url`, which has none. */
  id: string
}

export interface MediaPlayerFieldOptions extends DefaultFieldOptions<MediaPlayerValue> {
  placeholder?: string
  /**
   * Sources this field accepts. A video from any other one is refused rather than stored as
   * an address nothing can play.
   *
   * @default ['youtube', 'vimeo', 'vkvideo', 'url']
   */
  providers?: readonly MediaPlayerProvider[]
}

export interface MediaPlayerFieldDefinition {
  type: 'mediaPlayer'
  options: MediaPlayerFieldOptions
}

export interface NumberFieldOptions extends DefaultFieldOptions<number> {
  min?: number
  max?: number
  step?: number
  slider?: boolean
  /** Displayed inside the input. The stored value stays the bare number. */
  prefix?: string
  suffix?: string
}

export interface NumberFieldDefinition {
  type: 'number'
  options: NumberFieldOptions
}

export type BooleanFieldOptions = DefaultFieldOptions<boolean>

export interface BooleanFieldDefinition {
  type: 'boolean'
  options: BooleanFieldOptions
}

export interface FileFieldOptions extends DefaultFieldOptions<string> {
  label?: string
  description?: string
  placeholder?: string
  /**
   * Media types this field accepts, narrowing the module-wide `storage.accept`. `image/*` style
   * wildcards are understood.
   *
   * @example ['application/pdf']
   */
  accept?: string[]
  /**
   * Largest accepted upload for this field, in bytes. Cannot raise the module-wide
   * `storage.maxSize`, only lower it.
   */
  maxSize?: number
}

export interface FileFieldDefinition {
  type: 'file'
  options: FileFieldOptions
}

/**
 * `image` is `file` with `accept` preset and a picture preview. It keeps its own `type` rather
 * than becoming `field.file({ accept: ['image/*'] })` outright: the type is part of what an
 * entry's schema fingerprint is built from, so collapsing the two would mark every stored entry
 * as changed.
 */
export type ImageSource = 'absolute' | 'relative' | 'upload'

export interface ImageFieldOptions extends FileFieldOptions {
  /**
   * Origins this image may use. An uploaded image is stored under Eponyme's media route, so it
   * stays distinguishable from an address entered by hand.
   *
   * @default ['absolute', 'relative', 'upload']
   */
  sources?: readonly ImageSource[]
}

export interface ImageFieldDefinition {
  type: 'image'
  options: ImageFieldOptions
}

export interface SelectOption<T extends string = string> {
  label: string
  value: T
}

export interface SelectFieldOptions<T extends string = string> extends DefaultFieldOptions<T> {
  options: ReadonlyArray<SelectOption<T>>
  placeholder?: string
}

export interface SelectFieldDefinition<T extends string = string> {
  type: 'select'
  options: SelectFieldOptions<T>
}

export interface RadioFieldOptions<T extends string = string> extends DefaultFieldOptions<T> {
  options: ReadonlyArray<SelectOption<T>>
}

export interface RadioFieldDefinition<T extends string = string> {
  type: 'radio'
  options: RadioFieldOptions<T>
}

export interface CheckboxGroupFieldOptions<T extends string = string> extends DefaultFieldOptions<T[]> {
  options: ReadonlyArray<SelectOption<T>>
  minItems?: number
  maxItems?: number
}

export interface CheckboxGroupFieldDefinition<T extends string = string> {
  type: 'checkboxGroup'
  options: CheckboxGroupFieldOptions<T>
}

export interface TagsFieldOptions<T extends string = string> extends DefaultFieldOptions<T[]> {
  /** Offered while typing. With `allowCustom` off, they are also the only accepted values. */
  suggestions?: readonly T[]
  /**
   * Whether a tag outside `suggestions` may be entered.
   *
   * @default false
   */
  allowCustom?: boolean
  minItems?: number
  maxItems?: number
  placeholder?: string
}

/**
 * Values a tags field may hold, read from the options as they were written: the suggestions
 * themselves while the list is closed, any string once `allowCustom` opens it. A tag list is
 * therefore never a mix of types.
 *
 * Read from the object rather than from a type parameter on purpose. A parameter carrying
 * `allowCustom` is re-inferred as `boolean` when the config is checked against `EponymeConfig`,
 * and a conditional on `boolean` distributes over `true | false`, collapsing the union of
 * suggestions to plain `string`. The shape of the object survives that check – which is also
 * how `field.select()` and `field.checkboxGroup()` keep their literals.
 */
export type TagsValueOf<O> = O extends { allowCustom: true }
  ? string
  : O extends { suggestions: readonly (infer S extends string)[] } ? S : string

export interface TagsFieldDefinition<O extends TagsFieldOptions = TagsFieldOptions> {
  type: 'tags'
  options: O
}

export interface TodayDateDefault {
  readonly __eponymeDefault: 'today'
}

export interface DateFieldOptions extends Omit<DefaultFieldOptions<string>, 'defaultValue'> {
  defaultValue?: string | TodayDateDefault
  min?: string
  max?: string
}

export interface DateFieldDefinition {
  type: 'date'
  options: DateFieldOptions
}

export interface DateTimeFieldOptions extends DefaultFieldOptions<string> {
  /** Inclusive lower bound, as an ISO 8601 instant with an explicit time zone. */
  min?: string
  /** Inclusive upper bound, as an ISO 8601 instant with an explicit time zone. */
  max?: string
}

export interface DateTimeFieldDefinition {
  type: 'datetime'
  options: DateTimeFieldOptions
}

export type DurationInput = number | string

export interface DurationFieldOptions extends Omit<DefaultFieldOptions<number>, 'defaultValue'> {
  /** Milliseconds, or a readable duration such as `1h 10min`. */
  defaultValue?: DurationInput
  /** Inclusive lower bound, in milliseconds or as a readable duration. */
  min?: DurationInput
  /** Inclusive upper bound, in milliseconds or as a readable duration. */
  max?: DurationInput
}

export interface NormalizedDurationFieldOptions extends Omit<DurationFieldOptions, 'defaultValue' | 'min' | 'max'> {
  defaultValue?: number
  min?: number
  max?: number
}

export interface DurationFieldDefinition {
  type: 'duration'
  options: NormalizedDurationFieldOptions
}

export interface ColorPreset {
  label: string
  value: string
}

export interface ColorFieldOptions extends DefaultFieldOptions<string> {
  /** Clickable palette for this field; falls back to the module-wide `colorPresets`. */
  presets?: ReadonlyArray<string | ColorPreset>
}

export interface ColorFieldDefinition {
  type: 'color'
  options: ColorFieldOptions
}

export interface RelationFieldOptions<Multiple extends boolean = boolean>
  extends DefaultFieldOptions<Multiple extends true ? string[] : string> {
  /** Name of the collection pointed at, as it is declared in the config. */
  to: string
  /** Holds a list of slugs rather than one. */
  multiple?: Multiple
  /** Upper bound on a `multiple` relation. */
  maxItems?: number
  placeholder?: string
}

/**
 * Points at an entry of a collection, by slug.
 *
 * A slug is fixed at creation – Eponyme refuses to change one afterward – so it identifies
 * an entry as stably as an opaque id would, while staying readable in an export.
 */
export interface RelationFieldDefinition<Multiple extends boolean = boolean> {
  type: 'relation'
  options: RelationFieldOptions<Multiple>
}

export type ArrayItemFieldDefinition
  = | StringFieldDefinition
    | SlugFieldDefinition
    | EmailFieldDefinition
    | PhoneFieldDefinition
    | UrlFieldDefinition
    | MediaPlayerFieldDefinition
    | TextareaFieldDefinition
    | RichTextFieldDefinition
    | NumberFieldDefinition
    | BooleanFieldDefinition
    | FileFieldDefinition
    | ImageFieldDefinition
    | SelectFieldDefinition
    | RadioFieldDefinition
    | CheckboxGroupFieldDefinition
    | TagsFieldDefinition
    | DateFieldDefinition
    | DateTimeFieldDefinition
    | DurationFieldDefinition
    | ColorFieldDefinition
    | RelationFieldDefinition
    | EponymeCustomFieldDefinition

export type ArrayItemSchema = Record<string, ArrayItemFieldDefinition>
export type ArrayItemDefinition = ArrayItemFieldDefinition | ArrayItemSchema

export type ArrayItemValue<T extends ArrayItemDefinition>
  = T extends NumberFieldDefinition | DurationFieldDefinition ? number
    : T extends BooleanFieldDefinition ? boolean
      : T extends UrlFieldDefinition ? UrlValue
        : T extends MediaPlayerFieldDefinition ? MediaPlayerValue
          : T extends CheckboxGroupFieldDefinition<infer Value> ? Value[]
            : T extends RelationFieldDefinition<infer Multiple> ? (Multiple extends true ? string[] : string)
              : T extends EponymeCustomFieldDefinition<string, infer Value, object> ? Value
                : T extends ArrayItemFieldDefinition ? string
                  : T extends ArrayItemSchema ? { [K in keyof T]: ArrayItemValue<T[K]> }
                    : never

export interface ArrayFieldOptions<T extends ArrayItemDefinition> extends DefaultFieldOptions<Array<ArrayItemValue<T>>> {
  of: T
  minItems?: number
  maxItems?: number
  addLabel?: string

  /**
   * Heading of each item. `$i` is its position, and `$<field>` the value that field holds in
   * that item – so a title follows what is being written rather than repeating the index.
   * `$value` is the item itself, for an array of plain values.
   *
   * An item whose interpolation resolves to nothing falls back to `Item $i`, which is what a
   * row that has only just been added always does.
   *
   * @default 'Item $i'
   * @example
   * ```ts
   * itemLabel: '$question'
   * itemLabel: 'Step $i – $title'
   * ```
   */
  itemLabel?: string

  /** Starts every item folded, for an array whose items are long. */
  collapsed?: boolean

  showCounter?: boolean
}

export interface ArrayFieldDefinition<T extends ArrayItemDefinition = ArrayItemDefinition> {
  type: 'array'
  options: ArrayFieldOptions<T>
}

/**
 * A section holds sections, which is what lets a `defineBlock()` sit inside a tab: a tab is a
 * section under the hood. Arrays stay one level deep – an array item is still a plain field.
 */
export type SectionItemFieldDefinition = ArrayItemFieldDefinition | ArrayFieldDefinition | SectionFieldDefinition
export type SectionSchema = Record<string, SectionItemFieldDefinition>

export type SectionItemValue<T extends SectionItemFieldDefinition>
  = T extends ArrayFieldDefinition<infer Item> ? Array<ArrayItemValue<Item>>
    : T extends SectionFieldDefinition<infer Section> ? SectionValue<Section>
      : T extends ArrayItemFieldDefinition ? ArrayItemValue<T>
        : never

export type SectionValue<T extends SectionSchema> = { [K in keyof T]: SectionItemValue<T[K]> }

export interface SectionFieldOptions<T extends SectionSchema> extends DefaultFieldOptions<SectionValue<T>> {
  fields: T
}

export interface SectionFieldDefinition<T extends SectionSchema = SectionSchema> {
  type: 'section'
  options: SectionFieldOptions<T>
}

export interface TabDefinition<T extends SectionSchema = SectionSchema> {
  label?: string
  fields: T
}

export type TabsSchema = Record<string, TabDefinition>
export type TabsValue<T extends TabsSchema> = { [K in keyof T]: SectionValue<T[K]['fields']> }

export interface TabFieldOptions<T extends TabsSchema> extends DefaultFieldOptions<TabsValue<T>> {
  tabs: T
}

export interface TabFieldDefinition<T extends TabsSchema = TabsSchema> {
  type: 'tabs'
  options: TabFieldOptions<T>
}

export type FieldDefinition
  = | SectionItemFieldDefinition
    | SectionFieldDefinition
    | TabFieldDefinition
