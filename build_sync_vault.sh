#!/bin/sh
set -e

python3 prepare_sync_vault_build.py

echo
echo "Checking Rust toolchain..."
rustc --version
cargo --version

echo
echo "Building delegated vault source..."
cd solana/shadow-delegated-vault
cargo build --release

echo
echo "SYNC VAULT BUILD COMPLETE"
echo "Mainnet execution remains OFF."
