<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'managed' }>(), { variant: 'neutral' })
</script>

<template>
  <span
    class="ep:inline-flex ep:items-center ep:rounded-lg ep:px-2.5 ep:py-1 ep:text-xs ep:font-medium"
    :class="{
      neutral: 'ep:bg-badge-neutral ep:text-text-badge-neutral',
      success: 'ep:bg-badge-success ep:text-text-badge-success',
      warning: 'ep:bg-badge-warning ep:text-text-badge-warning',
      danger: 'ep:bg-badge-error ep:text-text-badge-error',
      managed: 'ep:bg-badge-managed ep:text-text-badge-managed',
    }[variant]"
  ><slot /></span>
</template>
