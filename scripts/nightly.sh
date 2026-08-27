#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

stable=$(node -p "require('./package.json').version")
version=$(node -p "const [major, minor] = '$stable'.split('.'); \`\${major}.\${Number(minor) + 1}.0-nightly.$(date +%Y%m%d)\`")
tag="v$version"

# Untracked files are ignored: `files` limits the tarball to `dist`, so only tracked
# modifications can change what gets published.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "The working tree has uncommitted changes. Commit or stash first." >&2
  exit 1
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Nightlies are published from main." >&2
  exit 1
fi

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "main is out of sync with origin/main." >&2
  exit 1
fi

if git rev-parse --verify --quiet "$tag" >/dev/null; then
  echo "$tag already exists. A nightly was already published today." >&2
  exit 1
fi

pnpm lint
pnpm test
pnpm test:types

# The bump is never committed: package.json stays on the last stable version in git,
# and only the tag records what was published.
restore() { npm version "$stable" --no-git-tag-version --allow-same-version >/dev/null; }
trap restore EXIT

npm version "$version" --no-git-tag-version >/dev/null
npm publish --tag nightly

git tag "$tag"
git push origin "$tag"

echo "Published $version and pushed $tag."