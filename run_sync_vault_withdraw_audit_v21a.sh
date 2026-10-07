#!/bin/sh
set -eu

echo "SYNC VAULT WITHDRAW AUDIT V21A"
echo "READ-ONLY: this sends NO transaction and signs NOTHING."
echo

node audit_sync_vault_withdraw_v21a.mjs | tee SYNC_VAULT_WITHDRAW_AUDIT.txt

PROGRAM_ID="${SHADOW_DELEGATED_PROGRAM_ID:-}"
if [ -z "$PROGRAM_ID" ]; then
  echo "ERROR: SHADOW_DELEGATED_PROGRAM_ID is not set." | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
  exit 2
fi

RPC_URL="${SOLANA_RPC_URL:-}"
if [ -z "$RPC_URL" ] && [ -n "${HELIUS_API_KEY:-}" ]; then
  RPC_URL="https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}"
fi
if [ -z "$RPC_URL" ]; then
  case "${SHADOW_SOLANA_CLUSTER:-mainnet-beta}" in
    devnet) RPC_URL="https://api.devnet.solana.com" ;;
    *) RPC_URL="https://api.mainnet-beta.solana.com" ;;
  esac
fi

echo >> SYNC_VAULT_WITHDRAW_AUDIT.txt
echo "=== IDL / PROGRAM RECOVERY ===" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt

rm -f SYNC_DEPLOYED_IDL.json.tmp
if command -v anchor >/dev/null 2>&1; then
  if anchor idl fetch "$PROGRAM_ID" --provider.cluster "$RPC_URL" > SYNC_DEPLOYED_IDL.json.tmp 2>/dev/null && [ -s SYNC_DEPLOYED_IDL.json.tmp ]; then
    mv SYNC_DEPLOYED_IDL.json.tmp SYNC_DEPLOYED_IDL.json
    echo "Anchor IDL: RECOVERED -> SYNC_DEPLOYED_IDL.json" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
    grep -Eo '"name"[[:space:]]*:[[:space:]]*"[^"]+"' SYNC_DEPLOYED_IDL.json \
      | grep -Ei 'withdraw|close|revoke|initialize|update|execute' \
      | head -50 | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt || true
  else
    rm -f SYNC_DEPLOYED_IDL.json.tmp
    echo "Anchor IDL: not available through anchor idl fetch" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
  fi
else
  echo "Anchor CLI: not installed; IDL fetch skipped" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
fi

if command -v solana >/dev/null 2>&1; then
  rm -f SYNC_DEPLOYED_PROGRAM_CURRENT.so
  if solana program dump --url "$RPC_URL" "$PROGRAM_ID" SYNC_DEPLOYED_PROGRAM_CURRENT.so >/dev/null 2>&1 && [ -s SYNC_DEPLOYED_PROGRAM_CURRENT.so ]; then
    echo "Program binary: RECOVERED -> SYNC_DEPLOYED_PROGRAM_CURRENT.so" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
    echo "Binary SHA256: $(sha256sum SYNC_DEPLOYED_PROGRAM_CURRENT.so | awk '{print $1}')" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
    if command -v strings >/dev/null 2>&1; then
      echo "Interesting binary strings:" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
      strings SYNC_DEPLOYED_PROGRAM_CURRENT.so \
        | grep -Ei 'withdraw|close.*vault|close.*account|revoke_session|initialize_policy|update_policy|execute_swap' \
        | head -80 | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt || true
    fi
  else
    rm -f SYNC_DEPLOYED_PROGRAM_CURRENT.so
    echo "Program binary: dump unavailable" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
  fi
else
  echo "Solana CLI: not installed; program dump skipped" | tee -a SYNC_VAULT_WITHDRAW_AUDIT.txt
fi

echo
echo "AUDIT COMPLETE"
echo "Upload or show SYNC_VAULT_WITHDRAW_AUDIT.txt to ChatGPT."
if [ -f SYNC_DEPLOYED_IDL.json ]; then
  echo "Also upload SYNC_DEPLOYED_IDL.json."
fi
echo "NO FUNDS MOVED."
