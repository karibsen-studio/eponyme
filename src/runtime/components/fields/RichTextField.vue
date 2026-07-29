<script setup lang="ts">
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, ref, watch } from 'vue'
import EPFormField from '../ui/EPFormField.vue'
import EPDropdownMenu from '../ui/EPDropdownMenu.vue'
import { useEponymeVariables } from '../../composables/useEponymeVariables'

const props = withDefaults(defineProps<{
  id: string
  modelValue?: unknown
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  minLength?: number
  maxLength?: number
  showCounter?: boolean
  errors?: string[]
  disabled?: boolean
}>(), {
  errors: () => [],
  placeholder: 'Start writing…',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const revision = ref(0)
const initialContent = typeof props.modelValue === 'string' ? props.modelValue : ''
const editor = useEditor({
  content: initialContent,
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer' },
      },
    }),
    Placeholder.configure({ placeholder: props.placeholder }),
    Image.configure({ HTMLAttributes: { class: 'eponyme-rich-text-image' } }),
  ],
  onTransaction: () => revision.value++,
  onUpdate: ({ editor }) => emit('update:modelValue', editor.isEmpty ? '' : editor.getHTML()),
})

function trackEditorRevision() {
  return revision.value
}

const characterCount = computed(() => {
  trackEditorRevision()
  return editor.value?.getText().length ?? 0
})

watch(() => props.modelValue, (value) => {
  const instance = editor.value
  if (!instance) return
  const next = typeof value === 'string' ? value : ''
  const current = instance.isEmpty ? '' : instance.getHTML()
  if (next !== current) instance.commands.setContent(next, { emitUpdate: false })
})

watch(() => props.disabled, disabled => editor.value?.setEditable(!disabled))

function isActive(name: string, attributes: Record<string, unknown> = {}) {
  trackEditorRevision()
  return editor.value?.isActive(name, attributes) ?? false
}

function setLink() {
  const instance = editor.value
  if (!instance) return
  const current = String(instance.getAttributes('link').href ?? '')
  const href = window.prompt('Link URL', current || 'https://')
  if (href === null) return
  if (!href.trim()) {
    instance.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  instance.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
}

function setImage() {
  const instance = editor.value
  if (!instance) return
  const src = window.prompt('Image URL', 'https://')
  if (src === null || !src.trim()) return
  // Same rule and wording as the image field validator, so both reject the same inputs.
  if (!/^https?:\/\//i.test(src.trim())) {
    window.alert('Must be an HTTP(S) URL.')
    return
  }
  const alt = window.prompt('Alt text (describe the image)', '') ?? ''
  instance.chain().focus().setImage({ src: src.trim(), alt: alt.trim() }).run()
}

interface Tool {
  icon: string
  title: string
  active?: boolean
  disabled?: boolean
  run: () => void
  /** Renders a separator before this tool. */
  separated?: boolean
}

const variables = useEponymeVariables()
// The preview shows what the variable resolves to today, so an editor can tell
// `currentYear` from `nextYear` without leaving the page.
const variableItems = computed(() => variables.map(variable => ({
  label: variable.preview ? `${variable.label} — ${variable.preview}` : variable.label,
  value: variable.name,
})))

/** Inserts the source form; the value is resolved when the page is served. */
function insertVariable(name: string) {
  editor.value?.chain().focus().insertContent(`{{ ${name} }}`).run()
}

const tools = computed<Tool[]>(() => {
  const instance = editor.value
  if (!instance) return []
  trackEditorRevision()
  return [
    { icon: 'mingcute:paragraph-line', title: 'Paragraph', active: isActive('paragraph'), run: () => instance.chain().focus().setParagraph().run() },
    { icon: 'mingcute:heading-2-line', title: 'Heading 2', active: isActive('heading', { level: 2 }), run: () => instance.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: 'mingcute:heading-3-line', title: 'Heading 3', active: isActive('heading', { level: 3 }), run: () => instance.chain().focus().toggleHeading({ level: 3 }).run() },
    { icon: 'mingcute:bold-line', title: 'Bold', active: isActive('bold'), separated: true, run: () => instance.chain().focus().toggleBold().run() },
    { icon: 'mingcute:italic-line', title: 'Italic', active: isActive('italic'), run: () => instance.chain().focus().toggleItalic().run() },
    { icon: 'mingcute:strikethrough-line', title: 'Strikethrough', active: isActive('strike'), run: () => instance.chain().focus().toggleStrike().run() },
    { icon: 'mingcute:link-line', title: 'Link', active: isActive('link'), run: setLink },
    { icon: 'mingcute:pic-line', title: 'Image', active: isActive('image'), run: setImage },
    { icon: 'mingcute:list-check-line', title: 'Bullet list', active: isActive('bulletList'), separated: true, run: () => instance.chain().focus().toggleBulletList().run() },
    { icon: 'mingcute:list-ordered-line', title: 'Numbered list', active: isActive('orderedList'), run: () => instance.chain().focus().toggleOrderedList().run() },
    { icon: 'mingcute:quote-left-line', title: 'Quote', active: isActive('blockquote'), run: () => instance.chain().focus().toggleBlockquote().run() },
    { icon: 'mingcute:back-2-line', title: 'Undo', separated: true, disabled: !instance.can().chain().focus().undo().run(), run: () => instance.chain().focus().undo().run() },
    { icon: 'mingcute:forward-2-line', title: 'Redo', disabled: !instance.can().chain().focus().redo().run(), run: () => instance.chain().focus().redo().run() },
  ]
})
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <div
      class="eponyme-rich-text ep:overflow-hidden ep:rounded-xl ep:bg-selected-ep ep:ring-white/10 ep:focus-within:ring-2"
      :class="{ 'ep:opacity-60': disabled, 'ep:ring-2 ep:ring-danger-ep/40': errors.length }"
    >
      <div
        v-if="editor"
        class="ep:flex ep:flex-wrap ep:items-center ep:gap-1 ep:border-b ep:border-border-ep ep:p-2"
        role="toolbar"
        :aria-label="`${label} formatting`"
      >
        <template
          v-for="tool in tools"
          :key="tool.title"
        >
          <span
            v-if="tool.separated"
            class="ep:mx-1 ep:h-5 ep:w-px ep:bg-border-ep"
          />
          <button
            type="button"
            class="rich-text-tool"
            :class="{ 'is-active': tool.active }"
            :disabled="disabled || tool.disabled"
            :title="tool.title"
            :aria-label="tool.title"
            :aria-pressed="tool.active"
            @mousedown.prevent="tool.run()"
          >
            <Icon
              :name="tool.icon"
              size="18"
              aria-hidden="true"
            />
          </button>
        </template>
        <EPDropdownMenu
          v-if="variables.length"
          :items="variableItems"
          @select="insertVariable"
        >
          <template #trigger>
            <button
              type="button"
              class="rich-text-tool"
              :disabled="disabled"
              title="Insert a variable"
              aria-label="Insert a variable"
            >
              <Icon
                name="mingcute:code-line"
                size="18"
                aria-hidden="true"
              />
            </button>
          </template>
        </EPDropdownMenu>
      </div>
      <EditorContent
        v-if="editor"
        :id="id"
        :editor="editor"
        class="ep:min-h-72"
      />
      <div
        v-else
        class="ep:min-h-72 ep:p-5 ep:text-sm ep:text-muted-ep"
      >
        Loading editor…
      </div>
    </div>
    <p
      v-if="maxLength !== undefined && showCounter !== false"
      class="ep:mt-1.5 ep:mb-0 ep:text-right ep:text-[11px] ep:text-muted-ep"
    >
      {{ characterCount }} / {{ maxLength }}
    </p>
  </EPFormField>
</template>

<style scoped>
.rich-text-tool {
  min-width: 2rem;
  height: 2rem;
  padding: 0 .55rem;
  border: 0;
  border-radius: .45rem;
  background: transparent;
  color: var(--ep-color-muted-ep, #8d8d8d);
  cursor: pointer;
  font-family: inherit;
  font-size: .75rem;
  font-weight: 650;
  transition: color 150ms ease, background-color 150ms ease;
  display: flex;
  justify-content: center;
  align-items: center;
}

.rich-text-tool:hover,
.rich-text-tool.is-active {
  background: var(--ep-color-theme-ep, #1c1c1c);
  color: white;
}

.rich-text-tool:disabled {
  cursor: not-allowed;
  opacity: .35;
}

.eponyme-rich-text :deep(.tiptap) {
  min-height: 18rem;
  padding: 1.25rem;
  color: var(--ep-color-text-ep, #e7e7e7);
  font-size: .925rem;
  line-height: 1.75;
  outline: none;
}

.eponyme-rich-text :deep(.tiptap > :first-child) {
  margin-top: 0;
}

.eponyme-rich-text :deep(.tiptap > :last-child) {
  margin-bottom: 0;
}

.eponyme-rich-text :deep(.tiptap h2) {
  margin: 1.5rem 0 .75rem;
  font-size: 1.5rem;
  line-height: 1.25;
}

.eponyme-rich-text :deep(.tiptap h3) {
  margin: 1.25rem 0 .625rem;
  font-size: 1.2rem;
  line-height: 1.3;
}

.eponyme-rich-text :deep(.tiptap p),
.eponyme-rich-text :deep(.tiptap ul),
.eponyme-rich-text :deep(.tiptap ol),
.eponyme-rich-text :deep(.tiptap blockquote) {
  margin: .75rem 0;
}

.eponyme-rich-text :deep(.tiptap ul),
.eponyme-rich-text :deep(.tiptap ol) {
  padding-left: 1.5rem;
}

.eponyme-rich-text :deep(.tiptap blockquote) {
  padding-left: 1rem;
  border-left: 2px solid var(--ep-color-muted-ep, #8d8d8d);
  color: var(--ep-color-muted-ep, #8d8d8d);
}

.eponyme-rich-text :deep(.tiptap img) {
  max-width: 100%;
  height: auto;
  border-radius: .75rem;
}

.eponyme-rich-text :deep(.tiptap img.ProseMirror-selectednode) {
  outline: 2px solid white;
  outline-offset: 2px;
}

.eponyme-rich-text :deep(.tiptap a) {
  color: white;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.eponyme-rich-text :deep(.tiptap p.is-editor-empty:first-child::before) {
  height: 0;
  color: var(--ep-color-muted-ep, #8d8d8d);
  content: attr(data-placeholder);
  float: left;
  pointer-events: none;
}
</style>
