<!--
  Thanks for contributing to Eponyme.

  Please open the pull request against `develop`, not `main`.
  Draft it if you want early feedback – it is a fine way to ask whether an approach is right.
-->

### What does this change?

<!-- What the change does, and why. If it fixes an issue, write "Closes #123". -->

### Type of change

- [ ] Bug fix: existing behaviour was wrong
- [ ] Feature: new behaviour
- [ ] Refactor: same behaviour, different code
- [ ] Documentation
- [ ] Build, dependencies or CI

### Does it change what a host application sees?

<!--
  Anything that alters a public API, a stored value, a validation message or the schema fingerprint.
  Say so plainly here, including what an existing project has to do about it. "No" is a fine answer.
-->

### How was it verified?

<!--
  Beyond the test suite. What you ran, on what, and what you saw. If something could not be
  verified, say which part and why – that is more useful than silence.
-->

### Checklist

- [ ] `pnpm lint`, `pnpm test` and `pnpm test:types` all pass
- [ ] Commits follow Conventional Commits, in English, one line, imperative and lowercase: `fix(users): refuse to change your own role`
- [ ] Tests cover the change, or I explain above why they cannot
- [ ] Public API changes are documented under `docs/`
- [ ] New interface strings are added to `src/runtime/locales/en.json`, and flagged for [`@eponyme/locale`](https://github.com/eponymejs/locale)
