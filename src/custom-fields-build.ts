import { readdir } from 'node:fs/promises'
import { resolve } from 'pathe'

export interface EponymeCustomFieldSource {
  name: string
  definitionPath: string
  componentPath: string
}

const validName = /^[a-z][a-z0-9-]*$/

export async function scanEponymeCustomFields(rootDir: string): Promise<EponymeCustomFieldSource[]> {
  const directory = resolve(rootDir, 'eponyme/fields')
  let files: string[]
  try {
    files = await readdir(directory)
  }
  catch (error) {
    if (isMissingDirectory(error)) return []
    throw error
  }

  const definitions = new Set(files.filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts')).map(file => file.slice(0, -3)))
  const components = new Set(files.filter(file => file.endsWith('.vue')).map(file => file.slice(0, -4)))
  const names = [...new Set([...definitions, ...components])].sort()

  return names.map((name) => {
    if (!validName.test(name))
      throw new TypeError(`[Eponyme] Custom field "${name}" must use lowercase letters, numbers and hyphens, and start with a letter.`)
    if (!definitions.has(name))
      throw new Error(`[Eponyme] Custom field "${name}" is missing eponyme/fields/${name}.ts.`)
    if (!components.has(name))
      throw new Error(`[Eponyme] Custom field "${name}" is missing eponyme/fields/${name}.vue.`)

    return {
      name,
      definitionPath: resolve(directory, `${name}.ts`),
      componentPath: resolve(directory, `${name}.vue`),
    }
  })
}

export function renderEponymeCustomFields(sources: EponymeCustomFieldSource[]): string {
  const imports = sources.map((source, index) => `import field${index} from ${JSON.stringify(source.definitionPath)}`).join('\n')
  const fields = sources.map((source, index) => `  ${JSON.stringify(source.name)}: field${index},`).join('\n')
  return `${imports}${imports ? '\n\n' : ''}export const eponymeCustomFields = Object.freeze({\n${fields}\n})\n`
}

export function renderEponymeCustomFieldComponents(sources: EponymeCustomFieldSource[]): string {
  const fields = sources
    .map(source => `  ${JSON.stringify(source.name)}: defineAsyncComponent(() => import(${JSON.stringify(source.componentPath)})),`)
    .join('\n')
  return `import { defineAsyncComponent } from 'vue'\n\nexport const eponymeCustomFieldComponents = Object.freeze({\n${fields}\n})\n`
}

export function renderEponymeCustomFieldTypes(sources: EponymeCustomFieldSource[]): string {
  const registry = sources
    .map(source => `    readonly ${JSON.stringify(source.name)}: typeof import(${JSON.stringify(source.definitionPath)})['default']`)
    .join('\n')
  const values = sources
    .map(source => `    ${JSON.stringify(source.name)}: import('@karibsen/eponyme').InferEponymeCustomFieldValue<typeof import(${JSON.stringify(source.definitionPath)})['default']>`)
    .join('\n')

  return `declare module '#eponyme/custom-fields' {\n  interface EponymeCustomFieldRegistry {\n${registry}\n  }\n}\n\ndeclare module '@karibsen/eponyme' {\n  interface EponymeCustomFieldValues {\n${values}\n  }\n}\n\nexport {}\n`
}

function isMissingDirectory(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
