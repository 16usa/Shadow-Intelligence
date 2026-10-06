#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXPECTED_PROGRAM_ID="HGFPeTaz4C3EVz3k4UBAB11g73FxaTAmaKxEQg4SAXpA"
RPC_URL="${SHADOW_SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}"

find_bin() {
  local name="$1" c
  for c in \
    "$ROOT/.shadow-toolchain/agave-v4.3.0/bin/$name" \
    "$ROOT/.shadow-toolchain/agave/bin/$name" \
    "$HOME/.local/share/solana/install/active_release/bin/$name"
  do
    [ -x "$c" ] && { echo "$c"; return 0; }
  done
  command -v "$name" 2>/dev/null || true
}

SOLANA="$(find_bin solana)"
SOLANA_KEYGEN="$(find_bin solana-keygen)"
[ -n "$SOLANA" ] || { echo "FAIL: solana CLI not found"; exit 1; }
[ -n "$SOLANA_KEYGEN" ] || { echo "FAIL: solana-keygen not found"; exit 1; }

echo "=== SHADOW DEPLOYER KEYPAIR RESOLVER v3.9.3 ==="
echo "Program ID: $EXPECTED_PROGRAM_ID"
echo "RPC:        $RPC_URL"

PROGRAM_JSON="$("$SOLANA" program show "$EXPECTED_PROGRAM_ID" --url "$RPC_URL" --output json 2>/dev/null || true)"

if [ -z "$PROGRAM_JSON" ]; then
  echo "PROGRAM_NOT_FOUND_ON_CHAIN"
  echo "This looks like an initial-deploy path."
  echo "The previous check already showed that the original program keypair for"
  echo "$EXPECTED_PROGRAM_ID"
  echo "was not found, so do not continue to deploy."
  exit 3
fi

AUTHORITY="$(PROGRAM_JSON="$PROGRAM_JSON" python3 - <<'PY'
import json, os
try:
    d=json.loads(os.environ["PROGRAM_JSON"])
except Exception:
    print("")
    raise SystemExit
for k in ("authority","upgradeAuthority","upgrade_authority"):
    v=d.get(k)
    if v:
        print(v)
        break
else:
    print("")
PY
)"

[ -n "$AUTHORITY" ] || {
  echo "FAIL: existing program found but upgrade authority could not be determined"
  exit 1
}

echo "On-chain upgrade authority: $AUTHORITY"
echo
echo "Searching local workspace/home for the matching keypair..."
echo "Only file path + PUBLIC key are printed. Private key JSON is never printed."

MATCH=""
COUNT=0

while IFS= read -r -d '' f; do
  COUNT=$((COUNT+1))
  PUB="$("$SOLANA_KEYGEN" pubkey "$f" 2>/dev/null || true)"
  [ -n "$PUB" ] || continue

  # Avoid noisy printing for every non-keypair. Print only successfully parsed keypairs.
  echo "candidate: $f"
  echo "pubkey:    $PUB"

  if [ "$PUB" = "$AUTHORITY" ]; then
    MATCH="$f"
    break
  fi
done < <(
  find "$ROOT" "$HOME/.config" "$HOME/.local" \
    \( -path "$ROOT/node_modules" -o \
       -path "$ROOT/.git" -o \
       -path "$ROOT/.shadow-toolchain" -o \
       -path "$ROOT/.shadow-build-cache" -o \
       -path "$ROOT/.shadow-sbf-home" -o \
       -path "$HOME/.local/share/solana/install" \) -prune -o \
    -type f \
    \( -name '*.json' -o -name '*keypair*' -o -name 'id.json' \) \
    -size -64k \
    -print0 2>/dev/null
)

echo
echo "Candidates checked: $COUNT"

if [ -z "$MATCH" ]; then
  echo "UPGRADE_AUTHORITY_KEYPAIR_NOT_FOUND"
  echo "Expected upgrade authority:"
  echo "$AUTHORITY"
  echo
  echo "STOP: no deploy will be attempted."
  echo "If this key exists only in a Replit Secret or external wallet, it must be"
  echo "made available as a local keypair file before deployment."
  exit 4
fi

echo "MATCH_FOUND"
echo "Upgrade authority keypair path: $MATCH"
printf '%s\n' "$MATCH" > "$ROOT/.shadow-deployer-path"
chmod 600 "$ROOT/.shadow-deployer-path"

echo
echo "=== RE-RUNNING READ-ONLY DEPLOY PRE-FLIGHT ==="
SOLANA_DEPLOYER="$MATCH" bash scripts/shadow-deploy-preflight.sh
