export type EponymeFieldType = 'string' | 'slug' | 'email' | 'url' | 'textarea' | 'richText' | 'number' | 'boolean' | 'image' | 'select' | 'radio' | 'checkboxGroup' | 'date' | 'color' | 'array' | 'section' | 'tabs'

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

export interface TextFieldOptions extends DefaultFieldOptions<string> {
  minLength?: number
  maxLength?: number
  showCounter?: boolean
  placeholder?: string
  trim?: boolean
  regex?: RegExp
  email?: boolean
  url?: boolean
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

export type UrlType = 'internal' | 'external'

export interface UrlValue {
  href: string
  type: UrlType
  openInNewTab: boolean
}

export interface UrlFieldOptions extends DefaultFieldOptions<UrlValue> {
  placeholder?: string
}

export interface UrlFieldDefinition {
  type: 'url'
  options: UrlFieldOptions
}

export interface NumberFieldOptions extends DefaultFieldOptions<number> {
  min?: number
  max?: number
  step?: number
  slider?: boolean
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

export interface ImageFieldOptions extends DefaultFieldOptions<string> {
  label?: string
  description?: string
  placeholder?: string
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

export type ArrayItemFieldDefinition
  = | StringFieldDefinition
    | SlugFieldDefinition
    | EmailFieldDefinition
    | UrlFieldDefinition
    | TextareaFieldDefinition
    | RichTextFieldDefinition
    | NumberFieldDefinition
    | BooleanFieldDefinition
    | ImageFieldDefinition
    | SelectFieldDefinition
    | RadioFieldDefinition
    | CheckboxGroupFieldDefinition
    | DateFieldDefinition
    | ColorFieldDefinition

export type ArrayItemSchema = Record<string, ArrayItemFieldDefinition>
export type ArrayItemDefinition = ArrayItemFieldDefinition | ArrayItemSchema

export type ArrayItemValue<T extends ArrayItemDefinition>
  = T extends NumberFieldDefinition ? number
    : T extends BooleanFieldDefinition ? boolean
      : T extends UrlFieldDefinition ? UrlValue
        : T extends CheckboxGroupFieldDefinition<infer Value> ? Value[]
          : T extends ArrayItemFieldDefinition ? string
            : T extends ArrayItemSchema ? { [K in keyof T]: ArrayItemValue<T[K]> }
              : never

export interface ArrayFieldOptions<T extends ArrayItemDefinition> extends DefaultFieldOptions<Array<ArrayItemValue<T>>> {
  of: T
  minItems?: number
  maxItems?: number
  addLabel?: string
  itemLabel?: string
  showCounter?: boolean
}

export interface ArrayFieldDefinition<T extends ArrayItemDefinition = ArrayItemDefinition> {
  type: 'array'
  options: ArrayFieldOptions<T>
}

export type SectionItemFieldDefinition = ArrayItemFieldDefinition | ArrayFieldDefinition
export type SectionSchema = Record<string, SectionItemFieldDefinition>

export type SectionItemValue<T extends SectionItemFieldDefinition>
  = T extends ArrayFieldDefinition<infer Item> ? Array<ArrayItemValue<Item>>
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
