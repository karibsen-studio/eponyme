<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'neutral' | 'success' | 'warning' | 'danger' }>(), { variant: 'neutral' })
</script>

<template>
  <span
    class="ep:inline-flex ep:items-center ep:rounded-full ep:border ep:px-2.5 ep:py-1 ep:text-[10px] ep:font-semibold ep:tracking-widest ep:uppercase"
    :class="{
      neutral: 'ep:border-white/15 ep:text-muted-ep',
      success: 'ep:border-success-ep/30 ep:text-success-ep',
      warning: 'ep:border-warning-ep/30 ep:text-warning-ep',
      danger: 'ep:border-danger-ep/30 ep:text-danger-ep',
    }[variant]"
  ><slot /></span>
</template>
