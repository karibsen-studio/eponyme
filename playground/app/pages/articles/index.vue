<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
const { entries, pending, error, refresh } = useEponymeCollection('articles')

useSeoMeta({
  title: 'Articles · Eponyme Playground',
  description: 'Articles created and published with an Eponyme collection.',
})
</script>

<template>
  <main class="articles-shell">
    <header class="articles-header">
      <NuxtLink
        to="/"
        class="back-link"
      >← Eponyme Playground</NuxtLink>
      <div>
        <p class="eyebrow">
          Eponyme collection
        </p>
        <h1>Articles</h1>
        <p>Every article below was created from the Eponyme dashboard.</p>
      </div>
      <NuxtLink
        to="/__eponyme/articles?create=1"
        class="admin-link"
      >+ Create an article</NuxtLink>
    </header>

    <section
      v-if="pending"
      class="empty-state"
    >
      Loading articles…
    </section>
    <section
      v-else-if="error"
      class="empty-state"
    >
      <p>Unable to load articles.</p>
      <button
        type="button"
        @click="refresh()"
      >
        Try again
      </button>
    </section>
    <section
      v-else-if="entries.length"
      class="article-grid"
    >
      <NuxtLink
        v-for="entry in entries"
        :key="entry.slug"
        :to="`/articles/${entry.slug}`"
        class="article-card"
      >
        <img
          v-if="entry.data.cover"
          :src="entry.data.cover"
          :alt="entry.title"
        >
        <div>
          <span>{{ entry.data.publishedOn || 'Published article' }}</span>
          <h2>{{ entry.title }}</h2>
          <p>{{ entry.data.excerpt }}</p>
          <strong>Read article →</strong>
        </div>
      </NuxtLink>
    </section>
    <section
      v-else
      class="empty-state"
    >
      <p>No published articles yet.</p>
      <NuxtLink
        to="/__eponyme/articles?create=1"
        class="admin-link"
      >Create the first article</NuxtLink>
    </section>
  </main>
</template>

<style scoped>
:global(body) { margin: 0; background: #f2f0e9; color: #171714; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
:global(*) { box-sizing: border-box; }
.articles-shell { width: min(72rem, 90vw); min-height: 100vh; margin: 0 auto; padding: 3rem 0 6rem; }
.articles-header { display: grid; grid-template-columns: 1fr auto; gap: 2rem; align-items: end; padding-bottom: 3rem; border-bottom: 1px solid rgb(23 23 20 / 15%); }
.back-link { grid-column: 1 / -1; color: #6f6e67; font-size: .85rem; font-weight: 700; text-decoration: none; }
.eyebrow { margin: 0 0 .75rem; color: #737168; font-size: .7rem; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(3rem, 8vw, 6rem); letter-spacing: -.07em; }
.articles-header p:last-child { max-width: 35rem; color: #66645c; }
.admin-link { width: fit-content; padding: .8rem 1rem; border: 1px solid #171714; color: inherit; font-size: .8rem; font-weight: 800; text-decoration: none; }
.article-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; padding-top: 3rem; }
.article-card { overflow: hidden; border: 1px solid rgb(23 23 20 / 15%); background: #f8f7f2; color: inherit; text-decoration: none; transition: transform .2s ease; }
.article-card:hover { transform: translateY(-4px); }
.article-card img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
.article-card div { padding: 1.5rem; }
.article-card span { color: #77746b; font-size: .7rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.article-card h2 { margin: .75rem 0; font-size: 1.7rem; letter-spacing: -.04em; }
.article-card p { min-height: 3rem; color: #66645c; line-height: 1.6; }
.article-card strong { font-size: .8rem; }
.empty-state { margin-top: 3rem; padding: 4rem; border: 1px dashed rgb(23 23 20 / 25%); text-align: center; }
@media (max-width: 700px) { .articles-header, .article-grid { grid-template-columns: 1fr; } }
</style>
