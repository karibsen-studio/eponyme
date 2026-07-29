<!-- eslint-disable vue/multi-word-component-names -->
<!-- Present so the dashboard can be checked against a host layout: without
     `layout: false` on its pages, this chrome would wrap /__eponyme. -->
<template>
  <div>
    <header>host-header</header>
    <slot />
    <footer>host-footer</footer>
  </div>
</template>
