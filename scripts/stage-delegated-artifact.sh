#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
SRC="${1:-}"

if [ -z "$SRC" ]; then
  echo "Usage: bash scripts/stage-delegated-artifact.sh /path/to/shadow_delegated_vault.so"
  exit 2
fi
if [ ! -f "$SRC" ]; then
  echo "ERROR: source .so not found: $SRC"
  exit 1
fi

DEST="${SHADOW_DELEGATED_SBF_PATH:-solana/shadow-delegated-vault/target/deploy/shadow_delegated_vault.so}"
case "$DEST" in
  /*) ;;
  *) DEST="$ROOT/$DEST" ;;
esac

mkdir -p "$(dirname "$DEST")"
TMP="${DEST}.tmp.$$"
cp "$SRC" "$TMP"
mv "$TMP" "$DEST"
node scripts/verify-delegated-artifact.mjs
echo "STAGED_DELEGATED_ARTIFACT_OK"
