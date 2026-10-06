#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "${SHADOW_DEPLOY_CONFIRM:-}" != "DEPLOY_MAINNET" ]; then
  echo "STOPPED: explicit confirmation required."
  echo "SHADOW_DEPLOY_CONFIRM=DEPLOY_MAINNET bash scripts/shadow-deploy-mainnet.sh"
  exit 2
fi

bash scripts/shadow-deploy-preflight.sh
source "$ROOT/.shadow-deploy-ready.env"

find_bin() {
  local name="$1" c
  for c in "$ROOT/.shadow-toolchain/agave-v4.3.0/bin/$name" "$ROOT/.shadow-toolchain/agave/bin/$name" "$HOME/.local/share/solana/install/active_release/bin/$name"; do
    [ -x "$c" ] && { echo "$c"; return 0; }
  done
  command -v "$name" 2>/dev/null || true
}
SOLANA="$(find_bin solana)"
[ -n "$SOLANA" ] || { echo "FAIL: solana CLI not found"; exit 1; }

NOW_SHA="$(sha256sum "$SHADOW_DEPLOY_ARTIFACT" | awk '{print $1}')"
[ "$NOW_SHA" = "$SHADOW_DEPLOY_ARTIFACT_SHA256" ] || { echo "FAIL: artifact changed after preflight"; exit 1; }

"$SOLANA" program deploy   "$SHADOW_DEPLOY_ARTIFACT"   --program-id "$SHADOW_DEPLOY_PROGRAM_ID_ARG"   --upgrade-authority "$SHADOW_DEPLOY_DEPLOYER"   --keypair "$SHADOW_DEPLOY_DEPLOYER"   --url "$SHADOW_DEPLOY_RPC_URL"

"$SOLANA" program show "$SHADOW_DEPLOY_PROGRAM_ID" --url "$SHADOW_DEPLOY_RPC_URL"
echo "SHADOW_MAINNET_DEPLOY_OK"
echo "No server restart was performed."
echo "No GitHub command was run."
