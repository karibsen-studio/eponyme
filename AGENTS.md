# AGENTS.md

## General

* Keep the code simple and readable.
* Avoid unnecessary abstractions.
* Reuse existing components, composables and utilities before creating new ones.
* Follow the existing project structure and naming conventions.
* Do not add dependencies unless they are really necessary.
* Keep TypeScript types explicit when they improve readability.
* Avoid `any` unless there is no reasonable alternative.

## Nuxt and Vue

* Use Vue 3 Composition API.
* Prefer `<script setup lang="ts">`.
* Use Nuxt features when they already solve the problem.
* Keep pages focused on layout and orchestration.
* Move reusable page logic into composables when possible.
* If a page contains fetching, filtering, pagination, state management or complex actions, consider extracting that logic into a composable.
* Do not create a composable for trivial logic used only once.
* Keep components reasonably small.
* Extract a component when a part of the UI is reusable or makes the parent easier to understand.

Example:

```txt
pages/
  users/
    index.vue

composables/
  useUsers.ts

components/
  users/
    UserCard.vue
    UserFilters.vue
```

The page should mainly assemble the UI:

```vue
<script setup lang="ts">
const {
  users,
  pending,
  filters,
  refresh,
} = useUsers()
</script>
```

## Components

* Prefer reusable components over duplicated markup.
* Keep business logic out of presentational components when possible.
* Use props for input and emits for component events.
* Do not create overly generic components without a real use case.
* Use components from the project's UI library before recreating them locally.

## Composables

* Prefix composables with `use`.
* A composable should have a clear responsibility.
* Keep API calls and related state together when it makes sense.
* Return only values and actions needed by consumers.
* Avoid global state unless the state actually needs to be shared globally.

Example:

```ts
export function useUsers() {
  const filters = ref({
    search: '',
  })

  const { data: users, pending, refresh } = useFetch('/api/users', {
    query: filters,
  })

  return {
    users,
    pending,
    filters,
    refresh,
  }
}
```

## Styling

* Follow the existing Tailwind CSS conventions.
* Avoid custom CSS when Tailwind is sufficient.
* Reuse existing design tokens and components.
* Keep responsive behavior in mind.
* Do not duplicate long class lists when they can reasonably be extracted.

## Code quality

* Remove unused code and imports.
* Do not leave commented-out code.
* Do not introduce unnecessary complexity.
* Prefer clear code over clever code.
* Keep functions focused on one responsibility.
* Handle loading, empty and error states when relevant.
* Preserve existing behavior unless the task explicitly requires changing it.


## Comments and punctuation

* Keep code comments short and simple.
* Avoid long explanatory comments when the code can be made clearer instead.
* Use only characters commonly used in French text.
* Do not use em dashes or en dashes. Use a normal hyphen `-` when needed.
* Avoid unusual typographic punctuation and decorative Unicode characters.
* Do not use semicolons `;` to separate items in `ul`, `ol` or other lists.
* Keep list items simple and use normal punctuation such as commas and periods when needed.

## Before finishing

* Check TypeScript errors.
* Check lint errors.
* Make sure imports are correct.
* Make sure the feature works on mobile when UI is involved.
* Make sure existing features were not accidentally broken.
