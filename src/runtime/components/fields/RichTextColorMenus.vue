<script setup lang="ts">
import { t } from '#eponyme/locale'
import type { Editor } from '@tiptap/vue-3'
import { computed, ref, watch } from 'vue'
import type { ColorPreset } from '../../types'
import RichTextColorMenu from './RichTextColorMenu.vue'

/**
 * The text and highlight menus, as one pair - the toolbar and the selection bubble both offer them, and
 * each rendering needs its own open state or opening one would open the other.
 */
const props = defineProps<{
  editor: Editor
  presets: ColorPreset[]
  /** Read from the selection by the parent, which is what tracks editor transactions. */
  textColor: string
  highlightColor: string
  disabled?: boolean
}>()

/** Reported so the selection bubble can stay on screen while a color is being picked. */
const open = defineModel<boolean>('open', { default: false })

const textMenuOpen = ref(false)
const highlightMenuOpen = ref(false)
const anyOpen = computed(() => textMenuOpen.value || highlightMenuOpen.value)

watch(anyOpen, value => open.value = value)

function apply(command: 'setColor' | 'setBackgroundColor', value: string) {
  props.editor.chain().focus()[command](value).run()
}

function clear(command: 'unsetColor' | 'unsetBackgroundColor') {
  textMenuOpen.value = false
  highlightMenuOpen.value = false
  props.editor.chain().focus()[command]().run()
}
</script>

<template>
  <RichTextColorMenu
    v-model:open="textMenuOpen"
    icon="mingcute:text-color-line"
    :title="t('richText.textColor')"
    :presets="presets"
    :color="textColor"
    :clear-label="t('richText.removeTextColor')"
    :disabled="disabled"
    @select="apply('setColor', $event)"
    @clear="clear('unsetColor')"
  />
  <RichTextColorMenu
    v-model:open="highlightMenuOpen"
    icon="mingcute:mark-pen-line"
    :title="t('richText.highlight')"
    :presets="presets"
    :color="highlightColor"
    :clear-label="t('richText.removeHighlight')"
    :disabled="disabled"
    @select="apply('setBackgroundColor', $event)"
    @clear="clear('unsetBackgroundColor')"
  />
</template>
