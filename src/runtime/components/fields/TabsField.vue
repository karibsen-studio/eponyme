<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed, ref, watch } from 'vue'
import SectionField from './SectionField.vue'
import type { SectionFieldDefinition, TabFieldDefinition } from '../../types'
import type { ValidationErrors } from '../../utils/validate-eponyme-data'
import { humanizeLabel } from '../../utils/humanize-label'
import { asRecord } from '../../utils/as-record'
import { childErrors, hasErrorsUnder, joinFieldPath } from '../../utils/field-path'

const props = defineProps<{
  fieldName: string
  definition: TabFieldDefinition
  modelValue: unknown
  /** Dotted path of this group; tabs extend it with their name. */
  path?: string
  /** Errors of this subtree, keyed relative to this group (`seo.title`). */
  errors?: ValidationErrors
  disabled?: boolean
  /** Drops the rule separating this group from what precedes it, and the room it needs. */
  hideTopBorder?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()
const tabs = computed(() => Object.entries(props.definition.options.tabs))
const activeTab = ref(tabs.value[0]?.[0] ?? '')
const basePath = computed(() => props.path || props.fieldName)
const tabsData = computed(() => asRecord(props.modelValue))

watch(tabs, (value) => {
  if (!value.some(([name]) => name === activeTab.value)) activeTab.value = value[0]?.[0] ?? ''
})

function updateTab(name: string, value: Record<string, unknown>) {
  emit('update:modelValue', { ...tabsData.value, [name]: value })
}

function sectionDefinition(name: string): SectionFieldDefinition {
  return {
    type: 'section',
    options: { fields: props.definition.options.tabs[name]?.fields ?? {} },
  }
}

function tabHasErrors(name: string) {
  return hasErrorsUnder(props.errors, name)
}

function focusTab(offset: number) {
  const index = tabs.value.findIndex(([name]) => name === activeTab.value)
  const next = tabs.value[(index + offset + tabs.value.length) % tabs.value.length]
  if (!next) return
  activeTab.value = next[0]
  document.getElementById(`tab-${basePath.value}-${next[0]}`)?.focus()
}
</script>

<template>
  <section :class="hideTopBorder ? '' : 'ep:border-t ep:border-border-default ep:pt-5'">
    <header class="ep:mb-5">
      <h2 class="ep:m-0 ep:min-w-0 ep:max-w-full ep:text-xl ep:font-semibold ep:tracking-tight ep:text-text-strong ep:[overflow-wrap:anywhere]">
        {{ humanizeLabel(fieldName, definition.options.label) }}
      </h2>
      <p
        v-if="definition.options.description"
        class="ep:mt-1 ep:mb-0 ep:text-xs ep:leading-relaxed ep:text-text-muted"
      >
        {{ definition.options.description }}
      </p>
    </header>

    <div
      role="tablist"
      :aria-label="humanizeLabel(fieldName, definition.options.label)"
      class="ep:mb-6 ep:flex ep:flex-wrap ep:gap-1 ep:border-b ep:border-border-default"
      @keydown.right.prevent="focusTab(1)"
      @keydown.left.prevent="focusTab(-1)"
    >
      <button
        v-for="([tabName, tabDefinition]) in tabs"
        :id="`tab-${basePath}-${tabName}`"
        :key="tabName"
        type="button"
        role="tab"
        :aria-selected="activeTab === tabName"
        :aria-controls="`panel-${basePath}-${tabName}`"
        :tabindex="activeTab === tabName ? 0 : -1"
        class="ep:-mb-px ep:min-w-0 ep:max-w-full ep:cursor-pointer ep:border-0 ep:border-b-2 ep:bg-transparent ep:px-4 ep:py-2.5 ep:text-left ep:text-sm ep:font-medium ep:transition ep:[overflow-wrap:anywhere]"
        :class="activeTab === tabName ? 'ep:border-contrast ep:text-text-strong' : 'ep:border-transparent ep:text-text-muted ep:hover:text-text-default'"
        @click="activeTab = tabName"
      >
        {{ humanizeLabel(tabName, tabDefinition.label) }}<span
          v-if="tabHasErrors(tabName)"
          class="ep:ml-1 ep:text-danger"
          :aria-label="t('tabs.hasErrors', { tab: humanizeLabel(tabName, tabDefinition.label) })"
        >•</span>
      </button>
    </div>

    <template
      v-for="([tabName]) in tabs"
      :key="tabName"
    >
      <div
        v-if="activeTab === tabName"
        :id="`panel-${basePath}-${tabName}`"
        role="tabpanel"
        :aria-labelledby="`tab-${basePath}-${tabName}`"
      >
        <SectionField
          hide-header
          :field-name="tabName"
          :path="joinFieldPath(basePath, tabName)"
          :definition="sectionDefinition(tabName)"
          :model-value="tabsData[tabName]"
          :errors="childErrors(errors, tabName)"
          :disabled="disabled"
          @update:model-value="updateTab(tabName, $event)"
        />
      </div>
    </template>
  </section>
</template>
