<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
const route = useRoute()
const slug = String(route.params.slug)
const { data: response, error } = useEponymeCollectionEntry('articles', slug)
const article = computed(() => response.value?.data)
</script>

<template>
  <div>
    <p v-if="error">
      article-not-available
    </p>
    <article v-else-if="article">
      <h1>{{ article.title }}</h1>
      <p>{{ article.excerpt }}</p>
    </article>
  </div>
</template>
