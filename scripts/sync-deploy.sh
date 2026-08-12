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

# Unstage secret env files only — keep .env.example (placeholders, no secrets)
git reset HEAD -- .env .env.local 2>/dev/null || true
while IFS= read -r envfile; do
  [[ -z "$envfile" ]] && continue
  [[ "$envfile" == ".env.example" ]] && continue
  git reset HEAD -- "$envfile" 2>/dev/null || true
done < <(git diff --cached --name-only | grep -E '^\.env' || true)

if git diff --cached --quiet; then
  echo "No staged changes after excluding env files."
  exit 0
fi

git commit -m "$MESSAGE"
git push origin main

echo "Pushed to GitHub. Vercel will auto-deploy from main."

if command -v vercel >/dev/null 2>&1; then
  vercel --prod --yes
  echo "Vercel production deploy triggered."
fi
