<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
// Every element below belongs to the site, not to Eponyme: the composable only
// provides the fields, their values, their errors and the submit handler.
const { fields, errors, honeypot, pending, submitted, submit, reset } = useEponymeForm('contact')

useSeoMeta({ title: 'Contact · Eponyme Playground' })
</script>

<template>
  <main class="contact-shell">
    <NuxtLink
      to="/"
      class="back-link"
    >← Home</NuxtLink>
    <h1>Get in touch</h1>

    <div
      v-if="submitted"
      class="status-panel"
    >
      <p>Thanks, your message was received.</p>
      <button
        type="button"
        @click="reset"
      >
        Send another
      </button>
    </div>

    <form
      v-else
      novalidate
      @submit.prevent="submit"
    >
      <div
        v-for="entry in fields"
        :key="entry.name"
        class="field"
        :data-invalid="entry.errors.length > 0"
      >
        <label :for="`contact-${entry.name}`">
          {{ entry.label }}<span v-if="entry.required"> *</span>
        </label>

        <select
          v-if="entry.definition.type === 'select'"
          :id="`contact-${entry.name}`"
          :value="entry.value"
          @change="entry.update(($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            Choose…
          </option>
          <option
            v-for="option in entry.definition.options.options"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>

        <label
          v-else-if="entry.definition.type === 'boolean'"
          class="checkbox"
        >
          <input
            :id="`contact-${entry.name}`"
            type="checkbox"
            :checked="Boolean(entry.value)"
            @change="entry.update(($event.target as HTMLInputElement).checked)"
          >
        </label>

        <textarea
          v-else-if="entry.definition.type === 'textarea'"
          :id="`contact-${entry.name}`"
          rows="6"
          :value="String(entry.value ?? '')"
          @input="entry.update(($event.target as HTMLTextAreaElement).value)"
        />

        <input
          v-else
          :id="`contact-${entry.name}`"
          :type="entry.definition.type === 'email' ? 'email' : 'text'"
          :value="String(entry.value ?? '')"
          @input="entry.update(($event.target as HTMLInputElement).value)"
        >

        <p
          v-for="message in entry.errors"
          :key="message"
          class="error"
        >
          {{ message }}
        </p>
      </div>

      <!-- Trap field: a human never sees it, a bot fills it in. -->
      <input
        v-if="honeypot"
        :name="honeypot"
        tabindex="-1"
        autocomplete="off"
        hidden
      >

      <p
        v-if="errors._form"
        class="error"
      >
        {{ errors._form.join(' ') }}
      </p>

      <button
        type="submit"
        :disabled="pending"
      >
        {{ pending ? 'Sending…' : 'Send message' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
:global(body) { margin: 0; background: #f2f0e9; color: #171714; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.contact-shell { width: min(38rem, 88vw); min-height: 100vh; margin: 0 auto; padding: 3rem 0 7rem; }
.back-link { color: #6f6e67; font-size: .85rem; font-weight: 700; text-decoration: none; }
h1 { margin: 2rem 0 2.5rem; font-size: clamp(2.5rem, 6vw, 4rem); line-height: 1; letter-spacing: -.05em; }
.field { display: grid; gap: .4rem; margin-bottom: 1.5rem; }
label { font-size: .8rem; font-weight: 700; letter-spacing: .02em; }
input, select, textarea { padding: .75rem; border: 1px solid rgb(23 23 20 / 20%); border-radius: .5rem; background: #fff; font: inherit; }
.field[data-invalid="true"] input, .field[data-invalid="true"] select, .field[data-invalid="true"] textarea { border-color: #b4443a; }
.checkbox input { width: 1.1rem; height: 1.1rem; }
.error { margin: 0; color: #b4443a; font-size: .8rem; }
button { padding: .8rem 1.5rem; border: 0; border-radius: .5rem; background: #171714; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.status-panel { margin-top: 3rem; padding: 2.5rem; border: 1px dashed rgb(23 23 20 / 25%); text-align: center; }
</style>
