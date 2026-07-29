<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed } from 'vue'

const { data, pending, error, refresh } = useEponyme('pages/test/Homepage')

const projects = computed(() => (data.value?.content.projects.items ?? []).map((project, index) => ({
  ...project,
  number: String(index + 1).padStart(2, '0'),
})))

useSeoMeta({
  title: () => data.value?.content.seo.title ?? 'Eponyme Playground',
  description: () => data.value?.content.seo.description ?? 'A reactive homepage powered by Eponyme.',
  ogTitle: () => data.value?.content.seo.socialTitle,
  ogImage: () => data.value?.content.seo.socialImage,
})
</script>

<template>
  <main
    class="page-shell"
    :class="data ? `theme-${data.content.settings.theme}` : 'theme-warm'"
    :style="{
      '--accent-color': data?.content.settings.accentColor ?? '#171714',
      '--hero-width': `${data?.content.settings.heroWidth ?? 960}px`,
    }"
  >
    <header class="site-header">
      <NuxtLink
        to="/"
        class="brand"
      >
        Eponyme
        <span>Playground<template v-if="data?.content.settings.showLaunchDate"> · {{ data.content.settings.launchDate }}</template></span>
      </NuxtLink>
      <nav class="header-actions">
        <NuxtLink
          to="/articles"
          class="eponyme-link"
        >
          Articles
        </NuxtLink>
        <NuxtLink
          to="/__eponyme/pages/test/Homepagefhefehhehfvhefhzfehvjdjefjefjzfehjzhdefjejzfjejefjdzkfezfjzfj"
          class="eponyme-link"
        >
          Edit content
          <span aria-hidden="true">↗</span>
        </NuxtLink>
      </nav>
    </header>

    <section
      v-if="pending && !data"
      class="status-panel"
    >
      Loading homepage…
    </section>

    <section
      v-else-if="error"
      class="status-panel error-panel"
    >
      <p>Unable to load the homepage content.</p>
      <button
        type="button"
        @click="refresh()"
      >
        Try again
      </button>
    </section>

    <section
      v-else-if="data && !data.content.settings.published"
      class="status-panel"
    >
      <p>This homepage is currently unpublished.</p>
      <NuxtLink
        to="/__eponyme/pages/test/Homepagefhefehhehfvhefhzfehvjdjefjefjzfehjzhdefjejzfjejefjdzkfezfjzfj"
        class="primary-link"
      >
        Open Eponyme
      </NuxtLink>
    </section>

    <template v-else-if="data">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">
            {{ data.content.hero.eyebrow }}
          </p>
          <h1>{{ data.content.hero.title }}</h1>
          <p class="introduction">
            {{ data.content.hero.introduction }}
          </p>
          <div class="hero-actions">
            <a
              :href="data.content.hero.callToActionUrl.href"
              :target="data.content.hero.callToActionUrl.openInNewTab ? '_blank' : undefined"
              :rel="data.content.hero.callToActionUrl.openInNewTab ? 'noopener noreferrer' : undefined"
              :download="data.content.hero.callToActionUrl.download ? '' : undefined"
              class="primary-link"
            >
              {{ data.content.hero.callToActionLabel }}
              <span aria-hidden="true">→</span>
            </a>
            <a
              :href="`mailto:${data.content.settings.newsletterEmail}`"
              class="secondary-link"
            >
              {{ data.content.settings.newsletterEmail }}
            </a>
          </div>
        </div>

        <div class="hero-visual">
          <img
            :src="data.content.hero.image"
            alt="A creative workspace"
          >
          <div class="image-caption">
            <span>Live content</span>
            <strong>{{ data.content.projects.items.length }} projects selected</strong>
          </div>
        </div>
      </section>

      <section
        v-if="data.content.projects.visibleSections.includes('highlights') && data.content.projects.highlights.length"
        class="highlights"
        aria-label="Highlights"
      >
        <article
          v-for="(highlight, index) in data.content.projects.highlights"
          :key="`${highlight}-${index}`"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <p>{{ highlight }}</p>
        </article>
      </section>

      <section
        v-if="data.content.projects.visibleSections.includes('projects')"
        class="projects-section"
      >
        <div class="section-heading">
          <div>
            <p class="eyebrow">
              Selected work
            </p>
            <h2>Projects shaped with care.</h2>
          </div>
          <p>Every card below is connected to an item from the “Projects” array in Eponyme.</p>
        </div>

        <div class="projects-grid">
          <article
            v-for="project in projects"
            :key="project.number"
            class="project-card"
          >
            <span>{{ project.number }} · {{ project.category }}</span>
            <h3>{{ project.title }}</h3>
            <p>{{ project.description }}</p>
          </article>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  background: #f2f0e9;
  color: #171714;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

:global(a) {
  color: inherit;
}

.page-shell {
  min-height: 100vh;
  padding: 0 5vw 5rem;
  background: var(--page-background, #f2f0e9);
}

.theme-light {
  --page-background: #fff;
}

.theme-warm {
  --page-background: #f2f0e9;
}

.theme-dark {
  --page-background: #d8d5ca;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 5rem;
  border-bottom: 1px solid rgb(23 23 20 / 14%);
}

.brand,
.eponyme-link,
.primary-link,
.secondary-link {
  text-decoration: none;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.brand span {
  color: #6f6e67;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.eponyme-link {
  display: inline-flex;
  gap: 0.45rem;
  align-items: center;
  font-size: 0.82rem;
  font-weight: 700;
}

.header-actions {
  display: flex;
  gap: 1.25rem;
  align-items: center;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(18rem, 0.95fr);
  gap: clamp(2rem, 6vw, 7rem);
  align-items: center;
  min-height: calc(100vh - 5rem);
  max-width: var(--hero-width);
  margin: 0 auto;
  padding: 5rem 0;
}

.eyebrow {
  margin: 0 0 1.25rem;
  color: #737168;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  max-width: 12ch;
  margin-bottom: 1.75rem;
  font-size: clamp(3.25rem, 7vw, 7.5rem);
  font-weight: 700;
  letter-spacing: -0.075em;
  line-height: 0.92;
}

.introduction {
  max-width: 37rem;
  margin-bottom: 2rem;
  color: #5e5d56;
  font-size: clamp(1rem, 1.5vw, 1.25rem);
  line-height: 1.65;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
}

.primary-link {
  display: inline-flex;
  gap: 1.5rem;
  align-items: center;
  justify-content: space-between;
  min-height: 3.2rem;
  padding: 0 1.25rem;
  border-radius: 999px;
  background: var(--accent-color);
  color: white;
  font-size: 0.86rem;
  font-weight: 700;
}

.secondary-link {
  padding: 0.75rem 0.25rem;
  border-bottom: 1px solid #171714;
  font-size: 0.82rem;
  font-weight: 650;
}

.hero-visual {
  position: relative;
  overflow: hidden;
  min-height: min(68vh, 48rem);
  border-radius: 1.5rem;
  background: #222;
}

.hero-visual img {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-visual::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 50%, rgb(0 0 0 / 60%));
  content: '';
}

.image-caption {
  position: absolute;
  z-index: 1;
  right: 1.5rem;
  bottom: 1.5rem;
  left: 1.5rem;
  display: flex;
  align-items: end;
  justify-content: space-between;
  color: white;
}

.image-caption span {
  color: rgb(255 255 255 / 68%);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.image-caption strong {
  font-size: 0.85rem;
}

.highlights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid rgb(23 23 20 / 14%);
  border-bottom: 1px solid rgb(23 23 20 / 14%);
}

.highlights article {
  min-height: 10rem;
  padding: 1.5rem;
  border-right: 1px solid rgb(23 23 20 / 14%);
}

.highlights article:last-child {
  border-right: 0;
}

.highlights span,
.project-card > span {
  color: #8a887f;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
}

.highlights p {
  max-width: 16rem;
  margin: 3.5rem 0 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.projects-section {
  padding: 8rem 0 3rem;
}

.section-heading {
  display: flex;
  gap: 2rem;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 3rem;
}

.section-heading h2 {
  max-width: 13ch;
  margin-bottom: 0;
  font-size: clamp(2.5rem, 5vw, 5rem);
  letter-spacing: -0.06em;
  line-height: 0.98;
}

.section-heading > p {
  max-width: 25rem;
  margin-bottom: 0.5rem;
  color: #737168;
  font-size: 0.88rem;
  line-height: 1.6;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.project-card {
  min-height: 17rem;
  padding: 1.5rem;
  border: 1px solid rgb(23 23 20 / 12%);
  border-radius: 1.25rem;
  background: rgb(255 255 255 / 42%);
}

.project-card h3 {
  margin: 7rem 0 0.75rem;
  font-size: 1.2rem;
}

.project-card p {
  color: #737168;
  font-size: 0.84rem;
  line-height: 1.5;
}

.status-panel {
  display: grid;
  place-items: center;
  min-height: calc(100vh - 5rem);
  text-align: center;
}

.error-panel button {
  padding: 0.8rem 1rem;
  border: 0;
  border-radius: 999px;
  background: #171714;
  color: white;
  cursor: pointer;
}

@media (max-width: 850px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .hero-visual {
    min-height: 65vh;
  }

  .highlights,
  .projects-grid {
    grid-template-columns: 1fr;
  }

  .highlights article {
    border-right: 0;
    border-bottom: 1px solid rgb(23 23 20 / 14%);
  }

  .highlights article:last-child {
    border-bottom: 0;
  }

  .section-heading {
    display: block;
  }

  .section-heading > p {
    margin-top: 1.5rem;
  }
}

@media (max-width: 520px) {
  .page-shell {
    padding-inline: 1.25rem;
  }

  .brand span {
    display: none;
  }

  h1 {
    font-size: 3.4rem;
  }

  .hero {
    padding-top: 3.5rem;
  }
}
</style>
