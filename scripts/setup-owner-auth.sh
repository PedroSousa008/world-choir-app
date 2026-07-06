#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/.tools/node-v22.22.0-darwin-arm64/bin:$PATH"

OWNER_EMAIL="${OWNER_EMAIL:-sousa.2003pedro@gmail.com}"
OWNER_RELATIONSHIP_DATE="${OWNER_RELATIONSHIP_DATE:-10.09.2025}"
OWNER_PASSWORD="${OWNER_PASSWORD:-}"

if [[ -z "$OWNER_PASSWORD" ]]; then
  OWNER_PASSWORD="WC-Owner-$(openssl rand -hex 6)!2027"
fi

OWNER_PASSWORD_HASH="$(node -e "const b=require('bcryptjs'); console.log(b.hashSync(process.argv[1], 12))" "$OWNER_PASSWORD")"
OWNER_SESSION_SECRET="$(openssl rand -base64 48)"

add_env() {
  local name="$1"
  local value="$2"
  for env in production preview development; do
    printf '%s' "$value" | vercel env add "$name" "$env" --force 2>/dev/null || \
      printf '%s' "$value" | vercel env add "$name" "$env"
  done
}

echo "Configuring owner auth on Vercel..."
add_env OWNER_EMAIL "$OWNER_EMAIL"
add_env OWNER_RELATIONSHIP_DATE "$OWNER_RELATIONSHIP_DATE"
add_env OWNER_PASSWORD_HASH "$OWNER_PASSWORD_HASH"
add_env OWNER_SESSION_SECRET "$OWNER_SESSION_SECRET"

echo ""
echo "Owner auth configured."
echo "Email: $OWNER_EMAIL"
echo "Relationship date: $OWNER_RELATIONSHIP_DATE"
echo "Owner password (save this securely): $OWNER_PASSWORD"
