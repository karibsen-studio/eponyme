<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed } from 'vue'
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import EPMediaPreview from '../ui/EPMediaPreview.vue'
import type { MediaPlayerProvider, MediaPlayerValue } from '../../types'
import { mediaPlayerProviders, parseEponymeMediaUrl, toMediaPlayerValue } from '../../utils/media-player'

const props = withDefaults(defineProps<{
  id: string
  modelValue?: unknown
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  providers?: readonly MediaPlayerProvider[]
  errors?: string[]
  disabled?: boolean
}>(), { errors: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: MediaPlayerValue] }>()

const PROVIDER_LABELS: Record<MediaPlayerProvider, { label: string, icon: string }> = {
  youtube: { label: t('media.youtube'), icon: 'mingcute:youtube-line' },
  // mingcute has no Vimeo mark, so the generic video icon stands in for it.
  vimeo: { label: t('media.vimeo'), icon: 'mingcute:movie-line' },
  url: { label: t('media.direct'), icon: 'mingcute:film-line' },
}

const value = computed(() => toMediaPlayerValue(props.modelValue))
const providers = computed(() => mediaPlayerProviders({ providers: props.providers }))
const detected = computed(() => value.value.provider ? PROVIDER_LABELS[value.value.provider] : undefined)

const placeholder = computed(() => props.placeholder ?? t('media.placeholder', { providers: providers.value.map(provider => PROVIDER_LABELS[provider]?.label).join(', ') }))

// The provider is read from the address on every keystroke, so the preview and the badge
// describe what is actually stored rather than what was picked in a separate control.
function update(url: string | number) {
  emit('update:modelValue', parseEponymeMediaUrl(String(url), { providers: props.providers }))
}
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <EPInputText
      :id="id"
      :model-value="value.url"
      type="url"
      :placeholder="placeholder"
      :required="required"
      :invalid="Boolean(errors.length)"
      :disabled="disabled"
      @update:model-value="update"
    />
    <p
      v-if="value.url"
      class="ep:mt-1.5 ep:mb-0 ep:flex ep:items-center ep:gap-1.5 ep:text-[11px] ep:text-text-muted"
    >
      <Icon
        :name="detected ? detected.icon : 'mingcute:alert-line'"
        size="14"
        aria-hidden="true"
      />
      {{ detected ? detected.label : t('media.unknown') }}
    </p>
    <EPMediaPreview
      v-if="detected"
      :model-value="value"
      :label="label"
      class="ep:mt-3"
    />
  </EPFormField>
</template>
