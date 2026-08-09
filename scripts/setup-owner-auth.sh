#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/.tools/node-v22.22.0-darwin-arm64/bin:$PATH"

OWNER_EMAIL="${OWNER_EMAIL:-sousa.2003pedro@gmail.com}"
OWNER_PASSWORD="${OWNER_PASSWORD:-}"

if [[ -z "$OWNER_PASSWORD" ]]; then
  OWNER_PASSWORD="WC-Owner-$(openssl rand -hex 6)!2027"
fi

OWNER_PASSWORD_HASH="$(node -e "const b=require('bcryptjs'); console.log(b.hashSync(process.argv[1], 12))" "$OWNER_PASSWORD")"
OWNER_SESSION_SECRET="$(openssl rand -base64 48)"

add_env() {
  local name="$1"
  local value="$2"
  for env in production preview; do
    printf '%s' "$value" | vercel env add "$name" "$env" --force --sensitive 2>/dev/null || \
      printf '%s' "$value" | vercel env add "$name" "$env" --force
  done
  printf '%s' "$value" | vercel env add "$name" development --force 2>/dev/null || \
    printf '%s' "$value" | vercel env add "$name" development
}

echo "Configuring owner auth on Vercel..."
add_env OWNER_EMAIL "$OWNER_EMAIL"
add_env OWNER_PASSWORD_HASH "$OWNER_PASSWORD_HASH"
add_env OWNER_SESSION_SECRET "$OWNER_SESSION_SECRET"

echo ""
echo "Owner auth configured."
echo "Email: $OWNER_EMAIL"
echo "Owner password (save this securely): $OWNER_PASSWORD"
