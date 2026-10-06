#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(pwd)"
RPC_URL="${SHADOW_SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}"

if [ ! -f package.json ] || [ ! -d solana/shadow-delegated-vault ]; then
  echo "ERROR: run this from the existing Shadow Intelligence Replit workspace."
  exit 1
fi

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
KEYGEN="$(find_bin solana-keygen)"

[ -n "$SOLANA" ] || { echo "ERROR: solana CLI not found"; exit 1; }
[ -n "$KEYGEN" ] || { echo "ERROR: solana-keygen not found"; exit 1; }

PROGRAM_KEY="$ROOT/.shadow-program-keys/shadow_delegated_vault-keypair.json"
if [ ! -f "$PROGRAM_KEY" ]; then
  PROGRAM_KEY="$ROOT/solana/shadow-delegated-vault/target/deploy/shadow_delegated_vault-keypair.json"
fi

PROGRAM_PUB=""
if [ -f "$PROGRAM_KEY" ]; then
  PROGRAM_PUB="$("$KEYGEN" pubkey "$PROGRAM_KEY" 2>/dev/null || true)"
fi

echo "=== SHADOW DEPLOYER WALLET SCANNER v3.9.8 ==="
echo "RPC: $RPC_URL"
[ -n "$PROGRAM_PUB" ] && echo "Pinned Program ID: $PROGRAM_PUB"
echo
echo "Scanning local keypair files..."
echo "Private key contents are NEVER printed."
echo

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Search only likely local user/workspace key locations; avoid huge caches/toolchains.
while IFS= read -r -d '' f; do
  pub="$("$KEYGEN" pubkey "$f" 2>/dev/null || true)"
  [ -n "$pub" ] || continue

  bal="$("$SOLANA" balance "$pub" --url "$RPC_URL" 2>/dev/null | awk '{print $1}' || true)"
  [ -n "$bal" ] || bal="?"

  kind="WALLET_CANDIDATE"
  if [ -n "$PROGRAM_PUB" ] && [ "$pub" = "$PROGRAM_PUB" ]; then
    kind="PROGRAM_KEYPAIR_DO_NOT_USE_AS_FEE_PAYER"
  fi

  printf '%s\t%s\t%s\t%s\n' "$bal" "$pub" "$kind" "$f" >> "$TMP"
done < <(
  find \
    "$ROOT" \
    "$HOME/.config" \
    "$HOME/.local" \
    -type f \
    \( -name '*.json' -o -name '*keypair*' -o -name 'id.json' \) \
    -size -64k \
    ! -path '*/node_modules/*' \
    ! -path '*/.git/*' \
    ! -path '*/.shadow-toolchain/*' \
    ! -path '*/.shadow-build-cache/*' \
    ! -path '*/.shadow-sbf-home/*' \
    ! -path '*/.shadow-build-logs/*' \
    ! -path '*/target/debug/*' \
    ! -path '*/target/release/*' \
    2>/dev/null -print0
)

if [ ! -s "$TMP" ]; then
  echo "NO_LOCAL_KEYPAIRS_FOUND"
  echo "No deploy was performed."
  exit 2
fi

# De-duplicate by pubkey, keep first path encountered.
python3 - "$TMP" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
rows = []
seen = set()
for line in p.read_text().splitlines():
    parts = line.split("\t", 3)
    if len(parts) != 4:
        continue
    bal, pub, kind, path = parts
    if pub in seen:
        continue
    seen.add(pub)
    try:
        num = float(bal)
    except Exception:
        num = -1.0
    rows.append((num, bal, pub, kind, path))

rows.sort(key=lambda r: r[0], reverse=True)

print("=== LOCAL SOLANA KEYPAIRS / MAINNET BALANCES ===")
for i, (num, bal, pub, kind, path) in enumerate(rows, 1):
    print(f"[{i}] {pub}")
    print(f"    balance: {bal} SOL")
    print(f"    type:    {kind}")
    print(f"    path:    {path}")

funded = [r for r in rows if r[0] > 0 and r[3] == "WALLET_CANDIDATE"]

print()
if funded:
    best = funded[0]
    print("FUNDED_DEPLOYER_CANDIDATE_FOUND")
    print("Candidate pubkey:", best[2])
    print("Candidate balance:", best[1], "SOL")
    print("Candidate path:", best[4])
    print()
    print("NEXT_STEP_READY_FOR_READ_ONLY_PREFLIGHT")
else:
    print("NO_FUNDED_DEPLOYER_CANDIDATE_FOUND")
    print("A separate funded wallet/keypair is required for the initial mainnet deploy.")

print()
print("No Solana deploy was performed.")
print("No server restart was performed.")
print("No GitHub command was run.")
PY
