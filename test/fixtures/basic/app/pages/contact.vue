<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
// The host application owns every element here; Eponyme only drives the data.
const { fields, errors, honeypot, submitted, submit } = useEponymeForm('contact')
</script>

<template>
  <form
    novalidate
    @submit.prevent="submit"
  >
    <p v-if="submitted">
      contact-submitted
    </p>
    <div
      v-for="entry in fields"
      :key="entry.name"
    >
      <label :for="`contact-${entry.name}`">{{ entry.label }}</label>
      <input
        :id="`contact-${entry.name}`"
        :name="entry.name"
        :required="entry.required"
        :value="entry.value"
        @input="entry.update(($event.target as HTMLInputElement).value)"
      >
      <span
        v-for="message in entry.errors"
        :key="message"
      >{{ message }}</span>
    </div>
    <input
      v-if="honeypot"
      :name="honeypot"
      tabindex="-1"
      autocomplete="off"
      hidden
    >
    <button type="submit">
      Send
    </button>
    <pre>{{ JSON.stringify(errors) }}</pre>
  </form>
</template>
