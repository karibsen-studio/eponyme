<script setup lang="ts">
import { t } from '#eponyme/locale'
import { ref, useId, watch } from 'vue'
import EPButton from './EPButton.vue'
import EPDialog from './EPDialog.vue'
import EPInputText from './EPInputText.vue'

const props = defineProps<{
  open: boolean
  modelValue?: unknown
  editing?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'insert': [value: { src: string, alt: string }]
}>()

const urlId = useId()
const urlErrorId = useId()
const altId = useId()
const src = ref('')
const alt = ref('')
const urlError = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  const value = props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue)
    ? props.modelValue as { src?: unknown, alt?: unknown }
    : {}
  src.value = typeof value.src === 'string' ? value.src : ''
  alt.value = typeof value.alt === 'string' ? value.alt : ''
  urlError.value = ''
})

watch(() => src.value, () => {
  if (urlError.value) urlError.value = ''
})

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

function updateOpen(open: boolean) {
  emit('update:open', open)
  if (!open) {
    src.value = ''
    alt.value = ''
    urlError.value = ''
  }
}

function insert() {
  const imageUrl = src.value.trim()
  if (!isHttpUrl(imageUrl)) {
    urlError.value = t('richText.imageUrlInvalid')
    return
  }

  emit('insert', { src: imageUrl, alt: alt.value.trim() })
  updateOpen(false)
}
</script>

<template>
  <EPDialog
    :open="open"
    :title="editing ? t('richText.imageDialogEditTitle') : t('richText.imageDialogTitle')"
    :description="t('richText.imageDialogDescription')"
    @update:open="updateOpen"
  >
    <form
      class="ep:grid ep:gap-5"
      novalidate
      @submit.prevent="insert"
    >
      <label class="ep:block">
        <span class="ep:mb-2 ep:block ep:text-sm ep:font-medium ep:text-white">{{ t('richText.imageUrl') }}</span>
        <EPInputText
          :id="urlId"
          v-model="src"
          type="url"
          :placeholder="t('richText.imageUrlPlaceholder')"
          :invalid="Boolean(urlError)"
          :aria-describedby="urlError ? urlErrorId : undefined"
          required
          autofocus
        />
        <span
          v-show="urlError"
          :id="urlErrorId"
          role="alert"
          class="ep:mt-1.5 ep:block ep:text-xs ep:text-danger-ep"
        >
          {{ urlError }}
        </span>
      </label>

      <label class="ep:block">
        <span class="ep:mb-2 ep:block ep:text-sm ep:font-medium ep:text-white">{{ t('richText.imageAlt') }}</span>
        <EPInputText
          :id="altId"
          v-model="alt"
        />
      </label>

      <div class="ep:flex ep:justify-end ep:gap-2">
        <EPButton
          variant="ghost"
          @click="updateOpen(false)"
        >
          {{ t('action.cancel') }}
        </EPButton>
        <EPButton
          type="submit"
          variant="primary"
        >
          {{ editing ? t('richText.imageUpdate') : t('richText.imageInsert') }}
        </EPButton>
      </div>
    </form>
  </EPDialog>
</template>
