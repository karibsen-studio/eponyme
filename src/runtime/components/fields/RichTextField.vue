<script setup lang="ts">
import { t } from '#eponyme/locale'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { BackgroundColor, Color, TextStyle } from '@tiptap/extension-text-style'
import { EditorContent, Extension, useEditor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { UrlValue } from '../../types'
import { computed, nextTick, ref, watch } from 'vue'
import { normalizeColorPresets, useEponymeColorPresets } from '../../composables/useEponymeColorPresets'
import { useEponymeVariables } from '../../composables/useEponymeVariables'
import { normalizeHexColor } from '../../utils/normalize-hex-color'
import { findEponymeVariableRanges } from '../../utils/variables'
import EPButton from '../ui/EPButton.vue'
import EPDropdownMenu from '../ui/EPDropdownMenu.vue'
import EPFormField from '../ui/EPFormField.vue'
import EPImageDialog from '../ui/EPImageDialog.vue'
import EPLinkDialog from '../ui/EPLinkDialog.vue'
import RichTextColorMenus from './RichTextColorMenus.vue'

const DownloadableLinkAttribute = Extension.create({
  name: 'downloadableLinkAttribute',
  addGlobalAttributes() {
    return [{
      types: ['link'],
      attributes: {
        download: {
          default: null,
          parseHTML: element => element.hasAttribute('download'),
          renderHTML: attributes => attributes.download ? { download: '' } : {},
        },
      },
    }]
  },
})

const variableHighlightKey = new PluginKey<DecorationSet>('eponymeVariableHighlight')
const bubbleMenuKey = new PluginKey('eponymeRichTextBubble')

function createVariableDecorations(document: ProseMirrorNode) {
  const decorations: Decoration[] = []
  document.descendants((node, position) => {
    if (!node.isText || !node.text) return
    for (const range of findEponymeVariableRanges(node.text)) {
      decorations.push(Decoration.inline(
        position + range.from,
        position + range.to,
        { class: 'eponyme-rich-text-variable' },
      ))
    }
  })
  return DecorationSet.create(document, decorations)
}

const EponymeVariableHighlight = Extension.create({
  name: 'eponymeVariableHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: variableHighlightKey,
        state: {
          init: (_, state) => createVariableDecorations(state.doc),
          apply: (transaction, decorations) => transaction.docChanged
            ? createVariableDecorations(transaction.doc)
            : decorations,
        },
        props: {
          decorations: state => variableHighlightKey.getState(state),
        },
      }),
    ]
  },
})

/** Offered when the host declared no `colorPresets`, so the two colour menus are never empty. */
const FALLBACK_COLORS = [
  { label: t('color.black'), value: '#000000' },
  { label: t('color.white'), value: '#ffffff' },
  { label: t('color.red'), value: '#f4222f' },
  { label: t('color.amber'), value: '#e6b85c' },
  { label: t('color.green'), value: '#72d39a' },
  { label: t('color.blue'), value: '#3b82f6' },
  { label: t('color.purple'), value: '#8b5cf6' },
  { label: t('color.pink'), value: '#ff41c5' },
]

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
  placeholder: t('richText.placeholder'),
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const revision = ref(0)
const linkDialogOpen = ref(false)
const imageDialogOpen = ref(false)
const linkValue = ref<UrlValue>({ href: '', type: 'external', openInNewTab: false, download: false })
const imageValue = ref({ src: '', alt: '' })
const editingImage = ref(false)
const fullscreen = ref(false)
const toolbarMenusOpen = ref(false)
const bubbleMenusOpen = ref(false)
const bubbleDismissed = ref(false)
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
    DownloadableLinkAttribute,
    EponymeVariableHighlight,
    Placeholder.configure({ placeholder: props.placeholder }),
    Image.configure({ HTMLAttributes: { class: 'eponyme-rich-text-image' } }),
    // Only the blocks the toolbar exposes, and only the alignments the sanitiser allows through - anything
    // wider would be written here and dropped on save.
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
    // Both colours ride on the same `<span>` mark, which is the only styled span the sanitiser lets
    // through.
    TextStyle,
    Color,
    BackgroundColor,
    // Not resizable: a width dragged on one screen would be stored for every reader.
    TableKit.configure({ table: { resizable: false } }),
  ],
  onSelectionUpdate: () => { bubbleDismissed.value = false },
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

/** An alignment is an attribute of whatever block holds it, so it is asked for without a name. */
function isActive(name: string | Record<string, unknown>, attributes: Record<string, unknown> = {}) {
  trackEditorRevision()
  const active = typeof name === 'string'
    ? editor.value?.isActive(name, attributes)
    : editor.value?.isActive(name)
  return active ?? false
}

function openLinkDialog() {
  const instance = editor.value
  if (!instance) return
  const attributes = instance.getAttributes('link')
  const href = String(attributes.href ?? '')
  linkValue.value = {
    href,
    type: href.startsWith('/') || href.startsWith('#') ? 'internal' : 'external',
    openInNewTab: attributes.target === '_blank',
    download: attributes.download === true,
  }
  linkDialogOpen.value = true
}

function applyLink(value: UrlValue) {
  const instance = editor.value
  if (!instance) return
  if (!value.href) {
    instance.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  const attributes = {
    href: value.href,
    target: value.openInNewTab ? '_blank' : null,
    rel: 'noopener noreferrer',
    download: value.download ? true : null,
  }
  instance.chain().focus().extendMarkRange('link').setLink(attributes).run()
}

function setImage() {
  const instance = editor.value
  if (!instance) return
  editingImage.value = instance.isActive('image')
  const attributes = editingImage.value ? instance.getAttributes('image') : {}
  imageValue.value = {
    src: typeof attributes.src === 'string' ? attributes.src : '',
    alt: typeof attributes.alt === 'string' ? attributes.alt : '',
  }
  imageDialogOpen.value = true
}

function insertImage(image: { src: string, alt: string }) {
  const instance = editor.value
  if (!instance) return
  const chain = instance.chain().focus()
  if (editingImage.value) chain.updateAttributes('image', image).run()
  else chain.setImage(image).run()
  void nextTick(() => instance.commands.focus())
}

const globalColorPresets = useEponymeColorPresets()
const colorPresets = globalColorPresets.length ? globalColorPresets : normalizeColorPresets(FALLBACK_COLORS)

/** Read back off the DOM, so `#b4654a` comes home as `rgb(180, 101, 74)` and has to be undone. */
function textStyleAttribute(name: 'color' | 'backgroundColor') {
  trackEditorRevision()
  return normalizeHexColor(editor.value?.getAttributes('textStyle')[name]) ?? ''
}

const textColor = computed(() => textStyleAttribute('color'))
const highlightColor = computed(() => textStyleAttribute('backgroundColor'))

/**
 * The field clips itself to its rounded corners, and a bubble over a selection near an edge hangs outside
 * them - so it is mounted on the dashboard root, which clips nothing and holds the sticky chrome the bubble
 * has to stay under.
 */
function bubbleContainer() {
  return document.querySelector<HTMLElement>('.eponyme-root') ?? document.body
}

/**
 * The bubble hides itself as soon as the editor loses focus, which a colour menu takes the moment it opens
 * - so an open menu keeps it on screen until the choice is made.
 */
function shouldShowBubbleMenu({ view, state, from, to }: { view: EditorView, state: EditorState, from: number, to: number }) {
  if (props.disabled || state.selection.empty || bubbleDismissed.value) return false
  if (!state.doc.textBetween(from, to, ' ').trim()) return false
  return view.hasFocus() || bubbleMenusOpen.value
}

/**
 * The bubble only follows the scrollport it is told about, and the window never scrolls here: the dashboard
 * shell has its own, and full screen turns the field into another.
 */
const bubbleScrollTarget = {
  addEventListener: (type: string, handler: EventListener) => document.addEventListener(type, handler, true),
  removeEventListener: (type: string, handler: EventListener) => document.removeEventListener(type, handler, true),
} as unknown as Window

const bubbleOptions = {
  strategy: 'fixed' as const,
  // Takes the bubble away once the selection has been scrolled out of sight.
  hide: {},
  scrollTarget: bubbleScrollTarget,
}

/** Hides the bubble now rather than at the next selection, which is what Escape asks for. */
function dismissBubbleMenu() {
  const instance = editor.value
  if (!instance || bubbleDismissed.value) return false
  const { from, to, empty } = instance.state.selection
  if (empty || !instance.state.doc.textBetween(from, to, ' ').trim()) return false
  bubbleDismissed.value = true
  instance.view.dispatch(instance.state.tr.setMeta(bubbleMenuKey, 'hide'))
  return true
}

/** A colour menu takes Escape for itself, then the bubble, and only then full screen. */
function handleEscape() {
  if (toolbarMenusOpen.value || bubbleMenusOpen.value) return
  if (dismissBubbleMenu()) return
  fullscreen.value = false
}

interface Tool {
  icon: string
  title: string
  active?: boolean
  disabled?: boolean
  run: () => void
  /** Renders a separator before this tool. */
  separated?: boolean
  /** Also offered by the selection bubble, which only carries inline formatting. */
  bubble?: boolean
}

const variables = useEponymeVariables()
// The preview shows what the variable resolves to today, so an editor can tell `currentYear` from
// `nextYear` without leaving the page.
const variableItems = computed(() => variables.map(variable => ({
  label: variable.preview ? t('richText.variablePreview', { label: variable.label, preview: variable.preview }) : variable.label,
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
    { icon: 'mingcute:paragraph-line', title: t('richText.paragraph'), active: isActive('paragraph'), run: () => instance.chain().focus().setParagraph().run() },
    { icon: 'mingcute:heading-2-line', title: t('richText.heading2'), active: isActive('heading', { level: 2 }), run: () => instance.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: 'mingcute:heading-3-line', title: t('richText.heading3'), active: isActive('heading', { level: 3 }), run: () => instance.chain().focus().toggleHeading({ level: 3 }).run() },
    { icon: 'mingcute:bold-line', title: t('richText.bold'), active: isActive('bold'), separated: true, bubble: true, run: () => instance.chain().focus().toggleBold().run() },
    { icon: 'mingcute:italic-line', title: t('richText.italic'), active: isActive('italic'), bubble: true, run: () => instance.chain().focus().toggleItalic().run() },
    { icon: 'mingcute:strikethrough-line', title: t('richText.strike'), active: isActive('strike'), bubble: true, run: () => instance.chain().focus().toggleStrike().run() },
    { icon: 'mingcute:link-line', title: t('richText.link'), active: isActive('link'), bubble: true, run: openLinkDialog },
    { icon: 'mingcute:pic-line', title: t('richText.image'), active: isActive('image'), run: setImage },
    { icon: 'mingcute:align-left-line', title: t('richText.alignLeft'), active: isActive({ textAlign: 'left' }), separated: true, run: () => instance.chain().focus().setTextAlign('left').run() },
    { icon: 'mingcute:align-center-line', title: t('richText.alignCenter'), active: isActive({ textAlign: 'center' }), run: () => instance.chain().focus().setTextAlign('center').run() },
    { icon: 'mingcute:align-right-line', title: t('richText.alignRight'), active: isActive({ textAlign: 'right' }), run: () => instance.chain().focus().setTextAlign('right').run() },
    { icon: 'mingcute:list-check-line', title: t('richText.bulletList'), active: isActive('bulletList'), separated: true, run: () => instance.chain().focus().toggleBulletList().run() },
    { icon: 'mingcute:list-ordered-line', title: t('richText.orderedList'), active: isActive('orderedList'), run: () => instance.chain().focus().toggleOrderedList().run() },
    { icon: 'mingcute:quote-left-line', title: t('richText.quote'), active: isActive('blockquote'), run: () => instance.chain().focus().toggleBlockquote().run() },
  ]
})

const bubbleTools = computed(() => tools.value.filter(tool => tool.bubble))

interface TableAction {
  value: string
  label: string
  icon: string
  disabled: boolean
  danger?: boolean
  run: () => void
}

/** A menu rather than ten more buttons, all but one of them disabled outside a table. */
const tableActions = computed<TableAction[]>(() => {
  const instance = editor.value
  if (!instance) return []
  trackEditorRevision()
  const chain = () => instance.chain().focus()
  return [
    {
      value: 'insert',
      label: t('richText.tableInsert'),
      icon: 'mingcute:table-2-line',
      disabled: !instance.can().insertTable(),
      run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      value: 'headerRow',
      label: t('richText.tableHeaderRow'),
      icon: 'mingcute:layout-grid-line',
      disabled: !instance.can().toggleHeaderRow(),
      run: () => chain().toggleHeaderRow().run(),
    },
    {
      value: 'columnBefore',
      label: t('richText.tableColumnBefore'),
      icon: 'mingcute:arrow-to-left-line',
      disabled: !instance.can().addColumnBefore(),
      run: () => chain().addColumnBefore().run(),
    },
    {
      value: 'columnAfter',
      label: t('richText.tableColumnAfter'),
      icon: 'mingcute:arrow-to-right-line',
      disabled: !instance.can().addColumnAfter(),
      run: () => chain().addColumnAfter().run(),
    },
    {
      value: 'rowBefore',
      label: t('richText.tableRowBefore'),
      icon: 'mingcute:arrow-to-up-line',
      disabled: !instance.can().addRowBefore(),
      run: () => chain().addRowBefore().run(),
    },
    {
      value: 'rowAfter',
      label: t('richText.tableRowAfter'),
      icon: 'mingcute:arrow-to-down-line',
      disabled: !instance.can().addRowAfter(),
      run: () => chain().addRowAfter().run(),
    },
    {
      value: 'mergeOrSplit',
      label: t('richText.tableMergeOrSplit'),
      icon: 'mingcute:git-merge-line',
      disabled: !instance.can().mergeOrSplit(),
      run: () => chain().mergeOrSplit().run(),
    },
    {
      value: 'deleteColumn',
      label: t('richText.tableDeleteColumn'),
      icon: 'mingcute:columns-2-line',
      disabled: !instance.can().deleteColumn(),
      danger: true,
      run: () => chain().deleteColumn().run(),
    },
    {
      value: 'deleteRow',
      label: t('richText.tableDeleteRow'),
      icon: 'mingcute:rows-2-line',
      disabled: !instance.can().deleteRow(),
      danger: true,
      run: () => chain().deleteRow().run(),
    },
    {
      value: 'deleteTable',
      label: t('richText.tableDelete'),
      icon: 'mingcute:delete-2-line',
      disabled: !instance.can().deleteTable(),
      danger: true,
      run: () => chain().deleteTable().run(),
    },
  ]
})

const tableItems = computed(() => tableActions.value.map(({ value, label, icon, disabled, danger }) => ({
  value,
  label,
  icon,
  disabled,
  danger,
})))

function runTableAction(value: string) {
  tableActions.value.find(action => action.value === value)?.run()
}

const historyTools = computed<Tool[]>(() => {
  const instance = editor.value
  if (!instance) return []
  trackEditorRevision()
  return [
    { icon: 'mingcute:back-2-line', title: t('richText.undo'), separated: true, disabled: !instance.can().chain().focus().undo().run(), run: () => instance.chain().focus().undo().run() },
    { icon: 'mingcute:forward-2-line', title: t('richText.redo'), disabled: !instance.can().chain().focus().redo().run(), run: () => instance.chain().focus().redo().run() },
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
      class="eponyme-rich-text ep:overflow-clip ep:rounded-xl ep:bg-surface-active ep:ring-contrast/10 ep:focus-within:ring-2"
      :class="{
        'ep:opacity-60': disabled,
        'ep:ring-2 ep:ring-danger/40': errors.length,
        'eponyme-rich-text-fullscreen ep:fixed ep:inset-0 ep:z-50 ep:rounded-none': fullscreen,
        'ep:relative': !fullscreen,
      }"
      @keydown.esc="handleEscape"
    >
      <div
        v-if="editor"
        class="eponyme-rich-text-toolbar ep:flex ep:flex-wrap ep:items-center ep:gap-1 ep:border-b ep:border-border-default ep:bg-surface-active ep:p-2"
        role="toolbar"
        :aria-label="t('richText.toolbar', { field: label })"
      >
        <template
          v-for="tool in tools"
          :key="tool.title"
        >
          <span
            v-if="tool.separated"
            class="ep:mx-1 ep:h-5 ep:w-px ep:bg-border-default"
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
        <span class="ep:mx-1 ep:h-5 ep:w-px ep:bg-border-default" />
        <RichTextColorMenus
          v-model:open="toolbarMenusOpen"
          :editor="editor"
          :presets="colorPresets"
          :text-color="textColor"
          :highlight-color="highlightColor"
          :disabled="disabled"
        />
        <template
          v-for="tool in historyTools"
          :key="tool.title"
        >
          <span
            v-if="tool.separated"
            class="ep:mx-1 ep:h-5 ep:w-px ep:bg-border-default"
          />
          <button
            type="button"
            class="rich-text-tool"
            :disabled="disabled || tool.disabled"
            :title="tool.title"
            :aria-label="tool.title"
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
          :items="tableItems"
          @select="runTableAction"
        >
          <template #trigger>
            <button
              type="button"
              class="rich-text-tool"
              :class="{ 'is-active': isActive('table') }"
              :disabled="disabled"
              :title="t('richText.table')"
              :aria-label="t('richText.table')"
            >
              <Icon
                name="mingcute:table-2-line"
                size="18"
                aria-hidden="true"
              />
            </button>
          </template>
        </EPDropdownMenu>
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
              :title="t('richText.variable')"
              :aria-label="t('richText.variable')"
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
      <!-- No reposition delay: the default one only fires once the scroll has stopped. -->
      <BubbleMenu
        v-if="editor"
        :editor="editor"
        :plugin-key="bubbleMenuKey"
        :should-show="shouldShowBubbleMenu"
        :append-to="bubbleContainer"
        :resize-delay="0"
        :options="bubbleOptions"
        class="eponyme-rich-text-bubble"
        :class="{ 'eponyme-rich-text-bubble-fullscreen': fullscreen }"
      >
        <div
          class="ep:flex ep:items-center ep:gap-1 ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-raised ep:p-1 ep:shadow-xl"
          role="toolbar"
          :aria-label="t('richText.selectionToolbar')"
        >
          <button
            v-for="tool in bubbleTools"
            :key="tool.title"
            type="button"
            class="rich-text-tool"
            :class="{ 'is-active': tool.active }"
            :disabled="disabled"
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
          <RichTextColorMenus
            v-model:open="bubbleMenusOpen"
            :editor="editor"
            :presets="colorPresets"
            :text-color="textColor"
            :highlight-color="highlightColor"
            :disabled="disabled"
          />
        </div>
      </BubbleMenu>
      <EditorContent
        v-if="editor"
        :id="id"
        :editor="editor"
        class="ep:min-h-72"
      />
      <div
        v-else
        class="ep:min-h-72 ep:p-5 ep:text-sm ep:text-text-muted"
      >
        {{ t('richText.loading') }}
      </div>
      <EPButton
        v-if="editor"
        class="eponyme-rich-text-expand"
        variant="ghost"
        size="icon"
        :title="fullscreen ? t('richText.exitFullscreen') : t('richText.fullscreen')"
        :aria-label="fullscreen ? t('richText.exitFullscreen') : t('richText.fullscreen')"
        :aria-pressed="fullscreen"
        @mousedown.prevent="fullscreen = !fullscreen"
      >
        <Icon
          :name="fullscreen ? 'mingcute:fullscreen-exit-2-line' : 'mingcute:fullscreen-2-line'"
          size="18"
          aria-hidden="true"
        />
      </EPButton>
    </div>
    <p
      v-if="maxLength !== undefined && showCounter !== false"
      class="ep:mt-1.5 ep:mb-0 ep:text-right ep:text-[11px] ep:text-text-muted"
    >
      {{ characterCount }} / {{ maxLength }}
    </p>
    <EPLinkDialog
      :open="linkDialogOpen"
      :model-value="linkValue"
      @update:open="linkDialogOpen = $event"
      @update:model-value="applyLink"
    />
    <EPImageDialog
      :open="imageDialogOpen"
      :model-value="imageValue"
      :editing="editingImage"
      @update:open="imageDialogOpen = $event"
      @insert="insertImage"
    />
  </EPFormField>
</template>

<style scoped>
/* The dashboard scrolls in `.eponyme-root`, so the bar sticks to that scrollport. The offset
   is what a page sets when it draws its own sticky header above the form. */
.eponyme-rich-text-toolbar {
  position: sticky;
  top: var(--ep-rich-text-sticky-top, 0px);
  z-index: 10;
}

.eponyme-rich-text :deep(.tiptap) {
  min-height: 18rem;
  padding: 1.25rem;
  color: var(--ep-color-richtext-text, #e7e7e7);
  font-size: .925rem;
  line-height: 1.75;
  outline: none;
}

/* Floats over the text rather than sitting in the toolbar, so it stays reachable at the corner
   an editor is already looking at. */
.eponyme-rich-text-expand {
  position: absolute;
  right: .625rem;
  bottom: .625rem;
  z-index: 10;
}

.eponyme-rich-text-fullscreen {
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* The wrapper is the scrollport once it is full screen, so the corner has to be the viewport's. */
.eponyme-rich-text-fullscreen .eponyme-rich-text-expand {
  position: fixed;
}

.eponyme-rich-text-fullscreen .eponyme-rich-text-toolbar {
  top: 0;
}

/* Room to write, but not a line of text the full width of a desktop screen. */
.eponyme-rich-text-fullscreen :deep(.tiptap) {
  min-height: calc(100dvh - 3.5rem);
  max-width: 46rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 6rem;
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

/* Tailwind's preflight drops every marker, so the editor has to put them back – otherwise a
   bulleted or numbered list is written blind and only shows up on the site. */
.eponyme-rich-text :deep(.tiptap ul),
.eponyme-rich-text :deep(.tiptap ol) {
  padding-left: 1.5rem;
  list-style-position: outside;
}

.eponyme-rich-text :deep(.tiptap ul) {
  list-style-type: disc;
}

.eponyme-rich-text :deep(.tiptap ol) {
  list-style-type: decimal;
}

.eponyme-rich-text :deep(.tiptap blockquote) {
  padding-left: 1rem;
  border-left: 2px solid var(--ep-color-text-muted, #8d8d8d);
  color: var(--ep-color-text-muted, #8d8d8d);
}

.eponyme-rich-text :deep(.tiptap img) {
  max-width: 100%;
  height: auto;
  border-radius: .75rem;
}

.eponyme-rich-text :deep(.tiptap img.ProseMirror-selectednode) {
  outline: 2px solid var(--ep-color-contrast, #ffffff);
  outline-offset: 2px;
}

.eponyme-rich-text :deep(.tiptap table) {
  width: 100%;
  margin: 1rem 0;
  table-layout: fixed;
  border-collapse: collapse;
  overflow: hidden;
}

.eponyme-rich-text :deep(.tiptap th),
.eponyme-rich-text :deep(.tiptap td) {
  padding: .5rem .625rem;
  border: 1px solid var(--ep-color-border-default, #3a3a3a);
  vertical-align: top;
}

.eponyme-rich-text :deep(.tiptap th) {
  background: var(--ep-color-surface-active, #1c1c1c);
  font-weight: 650;
  text-align: left;
}

.eponyme-rich-text :deep(.tiptap th > p),
.eponyme-rich-text :deep(.tiptap td > p) {
  margin: 0;
}

.eponyme-rich-text :deep(.tiptap .selectedCell) {
  background: color-mix(in srgb, var(--ep-color-contrast, #ffffff) 12%, transparent);
}

.eponyme-rich-text :deep(.tiptap a) {
  color: var(--ep-color-text-strong, #ffffff);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.eponyme-rich-text :deep(.eponyme-rich-text-variable) {
  color: #ff41c5;
  font-weight: 650;
}

@supports ((background-clip: text) or (-webkit-background-clip: text)) {
  .eponyme-rich-text :deep(.eponyme-rich-text-variable) {
    background-image: linear-gradient(90deg, #fe7af0, #ff41c5);
    background-position: 0% 50%;
    background-size: 200% 100%;
    background-clip: text;
    color: transparent;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

@media (prefers-reduced-motion: no-preference) {
  @supports ((background-clip: text) or (-webkit-background-clip: text)) {
    .eponyme-rich-text :deep(.eponyme-rich-text-variable) {
      animation: eponyme-variable-gradient 2.5s ease-in-out infinite alternate;
    }
  }
}

@keyframes eponyme-variable-gradient {
  to {
    background-position: 100% 50%;
  }
}

@media (forced-colors: active) {
  .eponyme-rich-text :deep(.eponyme-rich-text-variable) {
    background: none;
    color: linktext;
    text-decoration: underline;
    -webkit-text-fill-color: currentcolor;
  }
}

.eponyme-rich-text :deep(.tiptap p.is-editor-empty:first-child::before) {
  height: 0;
  color: var(--ep-color-text-muted, #8d8d8d);
  content: attr(data-placeholder);
  float: left;
  pointer-events: none;
}
</style>
