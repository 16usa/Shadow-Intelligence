#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(pwd)"
RPC_URL="${SHADOW_SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}"
DEPLOYER_DIR="$ROOT/.shadow-deployer"
DEPLOYER_KEY="$DEPLOYER_DIR/shadow-deployer-keypair.json"
PATH_FILE="$ROOT/.shadow-deployer-path"

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

mkdir -p "$DEPLOYER_DIR"
chmod 700 "$DEPLOYER_DIR"

# Never create a key if this CLI cannot suppress mnemonic/private output.
if ! "$KEYGEN" new --help 2>&1 | grep -q -- '--silent'; then
  echo "ERROR: this solana-keygen does not expose --silent."
  echo "Refusing to create a key because mnemonic/private material might be printed."
  exit 1
fi

if [ -f "$DEPLOYER_KEY" ]; then
  echo "Existing deployer keypair found; reusing it."
else
  echo "Creating a dedicated deployer/fee-payer keypair..."
  umask 077
  "$KEYGEN" new \
    --no-bip39-passphrase \
    --silent \
    --force \
    --outfile "$DEPLOYER_KEY"
fi

chmod 600 "$DEPLOYER_KEY"

PUBKEY="$("$KEYGEN" pubkey "$DEPLOYER_KEY")"
[ -n "$PUBKEY" ] || { echo "ERROR: could not derive deployer pubkey"; exit 1; }

BALANCE="$("$SOLANA" balance "$PUBKEY" --url "$RPC_URL" 2>/dev/null | awk '{print $1}' || true)"
[ -n "$BALANCE" ] || BALANCE="?"

# Record only the path, never key contents.
printf '%s\n' "$DEPLOYER_KEY" > "$PATH_FILE"
chmod 600 "$PATH_FILE"

# Ensure secrets stay out of Git.
touch "$ROOT/.gitignore"
for entry in "/.shadow-deployer/" "/.shadow-deployer-path"; do
  if ! grep -Fxq "$entry" "$ROOT/.gitignore"; then
    printf '%s\n' "$entry" >> "$ROOT/.gitignore"
  fi
done

echo
echo "=== SHADOW DEPLOYER WALLET READY ==="
echo "Deployer pubkey: $PUBKEY"
echo "Mainnet balance: $BALANCE SOL"
echo "Keypair path: $DEPLOYER_KEY"
echo
echo "IMPORTANT:"
echo "- Send SOL only to the public address above."
echo "- Do NOT send the keypair JSON or seed phrase anywhere."
echo "- Do NOT fund the program keypair as the fee payer."
echo "- This command did NOT deploy anything."
echo
echo "DEPLOYER_WALLET_CREATED_OR_REUSED_OK"
echo "NO_PRIVATE_KEY_OUTPUT_OK"
echo "NO_SOLANA_DEPLOY_PERFORMED"
echo "NO_SERVER_RESTART_PERFORMED"
echo "NO_GITHUB_COMMAND_RUN"
