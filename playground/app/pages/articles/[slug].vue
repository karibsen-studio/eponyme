<!-- eslint-disable vue/multi-word-component-names vue/no-v-html -->
<script setup lang="ts">
const route = useRoute()
const slug = String(route.params.slug)
const { data: response, pending, error } = useEponymeCollectionEntry('articles', slug)
const article = computed(() => response.value?.data)

useSeoMeta({
  title: () => article.value ? `${article.value.title} · Eponyme Playground` : 'Article · Eponyme Playground',
  description: () => article.value?.excerpt,
  ogImage: () => article.value?.cover,
})
</script>

<template>
  <main class="article-shell">
    <NuxtLink
      to="/articles"
      class="back-link"
    >← All articles</NuxtLink>
    <p v-if="pending">
      Loading article…
    </p>
    <div
      v-else-if="error"
      class="status-panel"
    >
      This article does not exist or has not been published.
    </div>
    <article v-else-if="article">
      <header>
        <p class="eyebrow">
          {{ article.publishedOn || 'Eponyme article' }}
        </p>
        <h1>{{ article.title }}</h1>
        <p class="excerpt">
          {{ article.excerpt }}
        </p>
      </header>
      <img
        v-if="article.cover"
        :src="article.cover"
        :alt="article.title"
        class="cover"
      >
      <!-- `eponymeMediaEmbedUrl` is auto-imported: the embed address is derived from the
           stored URL, so the page never has to know each provider's format. -->
      <div
        v-if="article.video.provider"
        class="video"
      >
        <video
          v-if="article.video.provider === 'url'"
          :src="eponymeMediaEmbedUrl(article.video)"
          controls
          preload="metadata"
        />
        <iframe
          v-else
          :src="eponymeMediaEmbedUrl(article.video)"
          :title="article.title"
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
        />
      </div>
      <EponymeRichText
        class="body"
        :html="article.body"
      />
    </article>
  </main>
</template>

<style scoped>
:global(body) { margin: 0; background: #f2f0e9; color: #171714; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
:global(*) { box-sizing: border-box; }
.article-shell { width: min(52rem, 88vw); min-height: 100vh; margin: 0 auto; padding: 3rem 0 7rem; }
.back-link { color: #6f6e67; font-size: .85rem; font-weight: 700; text-decoration: none; }
article header { padding: 5rem 0 3rem; }
.eyebrow { color: #737168; font-size: .7rem; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
h1 { max-width: 48rem; margin: 1rem 0; font-size: clamp(3rem, 8vw, 6.5rem); line-height: .95; letter-spacing: -.07em; }
.excerpt { max-width: 40rem; color: #66645c; font-size: 1.25rem; line-height: 1.6; }
.cover { width: 100%; max-height: 34rem; object-fit: cover; }
.video { margin-top: 2rem; overflow: hidden; aspect-ratio: 16 / 9; border-radius: 1rem; background: #000; }
.video video, .video iframe { display: block; width: 100%; height: 100%; border: 0; }
.body { padding: 3rem 0; font-family: Georgia, serif; font-size: 1.15rem; line-height: 1.9; }
.body :deep(h2) { margin: 2.5rem 0 1rem; font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 2rem; line-height: 1.2; letter-spacing: -.04em; }
.body :deep(h3) { margin: 2rem 0 .75rem; font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 1.45rem; line-height: 1.3; letter-spacing: -.025em; }
.body :deep(p), .body :deep(ul), .body :deep(ol), .body :deep(blockquote) { margin: 1rem 0; }
.body :deep(ul), .body :deep(ol) { padding-left: 1.5rem; }
.body :deep(blockquote) { padding: .25rem 0 .25rem 1.25rem; border-left: 3px solid #171714; color: #66645c; font-style: italic; }
.body :deep(a) { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 4px; }
.status-panel { margin-top: 4rem; padding: 3rem; border: 1px dashed rgb(23 23 20 / 25%); text-align: center; }
</style>
