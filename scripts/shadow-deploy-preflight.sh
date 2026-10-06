#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROGRAM_DIR="$ROOT/solana/shadow-delegated-vault"
LIB="$PROGRAM_DIR/programs/shadow_delegated_vault/src/lib.rs"
ARTIFACT="$PROGRAM_DIR/target/deploy/shadow_delegated_vault.so"
DEFAULT_PROGRAM_KEYPAIR="$PROGRAM_DIR/target/deploy/shadow_delegated_vault-keypair.json"
EXPECTED_PROGRAM_ID="HGFPeTaz4C3EVz3k4UBAB11g73FxaTAmaKxEQg4SAXpA"
RPC_URL="${SHADOW_SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}"
DEPLOYER="${SOLANA_DEPLOYER:-$HOME/.config/solana/id.json}"

find_bin() {
  local name="$1" c
  for c in "$ROOT/.shadow-toolchain/agave-v4.3.0/bin/$name" "$ROOT/.shadow-toolchain/agave/bin/$name" "$HOME/.local/share/solana/install/active_release/bin/$name"; do
    [ -x "$c" ] && { echo "$c"; return 0; }
  done
  command -v "$name" 2>/dev/null || true
}
fail(){ echo "FAIL: $*"; exit 1; }
pass(){ echo "PASS: $*"; }

SOLANA="$(find_bin solana)"
SOLANA_KEYGEN="$(find_bin solana-keygen)"
[ -n "$SOLANA" ] || fail "solana CLI not found"
[ -n "$SOLANA_KEYGEN" ] || fail "solana-keygen not found"

echo "=== SHADOW MAINNET DEPLOY/UPGRADE PRE-FLIGHT v3.9.2 ==="
echo "RPC: $RPC_URL"
"$SOLANA" --version
pass "Solana CLI available"

[ -f "$LIB" ] || fail "program source missing"
[ -s "$ARTIFACT" ] || fail "compiled SBF artifact missing/empty"
ARTIFACT_BYTES="$(wc -c < "$ARTIFACT" | tr -d ' ')"
ARTIFACT_SHA256="$(sha256sum "$ARTIFACT" | awk '{print $1}')"
echo "Artifact bytes: $ARTIFACT_BYTES"
echo "Artifact SHA256: $ARTIFACT_SHA256"
pass "compiled SBF artifact present"

DECLARED_ID="$(python3 - "$LIB" <<'PY'
from pathlib import Path
import re,sys
s=Path(sys.argv[1]).read_text()
m=re.search(r'declare_id!\("([^"]+)"\)', s)
print(m.group(1) if m else "")
PY
)"
[ "$DECLARED_ID" = "$EXPECTED_PROGRAM_ID" ] || fail "declare_id mismatch"
echo "declare_id!: $DECLARED_ID"
pass "declare_id matches expected Program ID"

[ -f "$DEPLOYER" ] || fail "deployer keypair missing: $DEPLOYER"
DEPLOYER_PUBKEY="$("$SOLANA_KEYGEN" pubkey "$DEPLOYER")"
echo "Deployer pubkey: $DEPLOYER_PUBKEY"

GENESIS="$("$SOLANA" genesis-hash --url "$RPC_URL" 2>/dev/null || true)"
[ -n "$GENESIS" ] || fail "cannot reach RPC"
echo "Genesis hash: $GENESIS"

BALANCE="$("$SOLANA" balance "$DEPLOYER_PUBKEY" --url "$RPC_URL" 2>/dev/null || true)"
[ -n "$BALANCE" ] || fail "cannot read deployer balance"
echo "Deployer balance: $BALANCE"

PROGRAM_JSON="$("$SOLANA" program show "$EXPECTED_PROGRAM_ID" --url "$RPC_URL" --output json 2>/dev/null || true)"
MODE=""
PROGRAM_ID_ARG=""

if [ -n "$PROGRAM_JSON" ]; then
  echo "=== EXISTING ON-CHAIN PROGRAM DETECTED ==="
  MODE="upgrade"
  PROGRAM_ID_ARG="$EXPECTED_PROGRAM_ID"
  AUTHORITY="$(PROGRAM_JSON="$PROGRAM_JSON" python3 - <<'PY'
import json, os
try:
    d=json.loads(os.environ["PROGRAM_JSON"])
except Exception:
    print("")
    raise SystemExit
for k in ("authority","upgradeAuthority","upgrade_authority"):
    if d.get(k):
        print(d[k]); break
else:
    print("")
PY
)"
  [ -n "$AUTHORITY" ] || fail "could not determine upgrade authority"
  echo "On-chain upgrade authority: $AUTHORITY"
  [ "$AUTHORITY" = "$DEPLOYER_PUBKEY" ] || fail "deployer is NOT current upgrade authority"
  pass "deployer matches current upgrade authority"
  echo "Program keypair is NOT required for this upgrade path."
  if [ -f "$DEFAULT_PROGRAM_KEYPAIR" ]; then
    CUR_ID="$("$SOLANA_KEYGEN" pubkey "$DEFAULT_PROGRAM_KEYPAIR" 2>/dev/null || true)"
    echo "Local target/deploy keypair pubkey: ${CUR_ID:-unreadable}"
    [ "$CUR_ID" = "$EXPECTED_PROGRAM_ID" ] || echo "WARN: mismatched local program keypair will be ignored for upgrade."
  fi
else
  echo "=== PROGRAM NOT FOUND ON-CHAIN: INITIAL DEPLOY PATH ==="
  MODE="initial"
  PROGRAM_ID_ARG="${SHADOW_PROGRAM_KEYPAIR:-$DEFAULT_PROGRAM_KEYPAIR}"
  [ -f "$PROGRAM_ID_ARG" ] || fail "initial deploy requires original program keypair"
  PROGRAM_KEYPAIR_ID="$("$SOLANA_KEYGEN" pubkey "$PROGRAM_ID_ARG" 2>/dev/null || true)"
  echo "Program keypair pubkey: ${PROGRAM_KEYPAIR_ID:-unreadable}"
  [ "$PROGRAM_KEYPAIR_ID" = "$EXPECTED_PROGRAM_ID" ] || fail "initial deploy requires matching original program keypair"
  pass "initial-deploy program keypair matches Program ID"
fi

cat > "$ROOT/.shadow-deploy-ready.env" <<EOF
SHADOW_DEPLOY_PROGRAM_ID=$EXPECTED_PROGRAM_ID
SHADOW_DEPLOY_PROGRAM_ID_ARG=$PROGRAM_ID_ARG
SHADOW_DEPLOY_ARTIFACT=$ARTIFACT
SHADOW_DEPLOY_DEPLOYER=$DEPLOYER
SHADOW_DEPLOY_DEPLOYER_PUBKEY=$DEPLOYER_PUBKEY
SHADOW_DEPLOY_RPC_URL=$RPC_URL
SHADOW_DEPLOY_MODE=$MODE
SHADOW_DEPLOY_ARTIFACT_SHA256=$ARTIFACT_SHA256
EOF
chmod 600 "$ROOT/.shadow-deploy-ready.env"

echo
echo "PRE_FLIGHT_READY"
echo "Program ID: $EXPECTED_PROGRAM_ID"
echo "Mode: $MODE"
echo "Artifact: $ARTIFACT"
echo "SHA256: $ARTIFACT_SHA256"
echo "NO DEPLOY PERFORMED"
