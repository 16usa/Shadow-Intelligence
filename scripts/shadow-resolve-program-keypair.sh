#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXPECTED_PROGRAM_ID="HGFPeTaz4C3EVz3k4UBAB11g73FxaTAmaKxEQg4SAXpA"

find_bin() {
  local name="$1"
  local c
  for c in \
    "$ROOT/.shadow-toolchain/agave-v4.3.0/bin/$name" \
    "$ROOT/.shadow-toolchain/agave/bin/$name" \
    "$HOME/.local/share/solana/install/active_release/bin/$name"
  do
    if [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  command -v "$name" 2>/dev/null || true
}

SOLANA_KEYGEN="$(find_bin solana-keygen)"
[ -n "$SOLANA_KEYGEN" ] || { echo "FAIL: solana-keygen not found"; exit 1; }

CURRENT="$ROOT/solana/shadow-delegated-vault/target/deploy/shadow_delegated_vault-keypair.json"

echo "Expected Program ID: $EXPECTED_PROGRAM_ID"
if [ -f "$CURRENT" ]; then
  CUR_ID="$("$SOLANA_KEYGEN" pubkey "$CURRENT" 2>/dev/null || true)"
  echo "Current target/deploy keypair: $CURRENT"
  echo "Current pubkey: ${CUR_ID:-unreadable}"
  if [ "$CUR_ID" = "$EXPECTED_PROGRAM_ID" ]; then
    echo "MATCH_ALREADY_CURRENT"
    printf '%s\n' "$CURRENT" > "$ROOT/.shadow-program-keypair-path"
    chmod 600 "$ROOT/.shadow-program-keypair-path"
    echo
    echo "=== RE-RUNNING PRE-FLIGHT WITH VERIFIED KEYPAIR ==="
    SHADOW_PROGRAM_KEYPAIR="$CURRENT" bash scripts/shadow-deploy-preflight.sh
    exit 0
  fi
fi

echo
echo "Searching workspace/backups for candidate keypairs..."
MATCH=""
COUNT=0

while IFS= read -r -d '' f; do
  COUNT=$((COUNT+1))
  PUB="$("$SOLANA_KEYGEN" pubkey "$f" 2>/dev/null || true)"
  [ -n "$PUB" ] || continue

  # Print only path + public key. Never print JSON/key material.
  echo "candidate: $f"
  echo "pubkey:    $PUB"

  if [ "$PUB" = "$EXPECTED_PROGRAM_ID" ]; then
    MATCH="$f"
    break
  fi
done < <(
  find "$ROOT" \
    \( -path "$ROOT/node_modules" -o \
       -path "$ROOT/.git" -o \
       -path "$ROOT/.shadow-toolchain" -o \
       -path "$ROOT/.shadow-build-cache" -o \
       -path "$ROOT/.shadow-sbf-home" \) -prune -o \
    -type f \
    \( -name '*keypair*.json' -o -name 'id.json' -o -name '*program*.json' \) \
    -print0 2>/dev/null
)

echo
echo "Candidates checked: $COUNT"

if [ -z "$MATCH" ]; then
  echo "ORIGINAL_PROGRAM_KEYPAIR_NOT_FOUND"
  echo "STOP: do not deploy with the current mismatched keypair."
  echo "The expected Program ID cannot be recreated from the public address alone."
  echo "You need the original keypair file/backup for:"
  echo "$EXPECTED_PROGRAM_ID"
  exit 3
fi

echo "MATCH_FOUND"
echo "Program keypair path: $MATCH"
printf '%s\n' "$MATCH" > "$ROOT/.shadow-program-keypair-path"
chmod 600 "$ROOT/.shadow-program-keypair-path"

echo
echo "=== RE-RUNNING READ-ONLY PRE-FLIGHT WITH MATCHING KEYPAIR ==="
SHADOW_PROGRAM_KEYPAIR="$MATCH" bash scripts/shadow-deploy-preflight.sh
