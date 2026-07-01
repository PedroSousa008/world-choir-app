#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MESSAGE="${1:-Update World Choir App}"

export PATH="$ROOT/.tools/node-v22.22.0-darwin-arm64/bin:$PATH"

if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to deploy."
  exit 0
fi

git add -A
git reset HEAD -- .env.local .env .env.* 2>/dev/null || true

if git diff --cached --quiet; then
  echo "No staged changes after excluding env files."
  exit 0
fi

git commit -m "$MESSAGE"
git push origin main

echo "Pushed to GitHub. Vercel will auto-deploy from main."

if command -v npm >/dev/null 2>&1 && [ -f package.json ]; then
  npm run build:site
fi

if command -v vercel >/dev/null 2>&1; then
  vercel --prod --yes
  echo "Vercel production deploy triggered."
fi
