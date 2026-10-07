#!/bin/sh
set -e
export RUSTUP_HOME="$PWD/.rustup"
export CARGO_HOME="$PWD/.cargo"
export PATH="$CARGO_HOME/bin:$PWD/.local/share/solana/install/active_release/bin:$PATH"

echo "Installing Solana CLI locally in workspace..."
mkdir -p "$PWD/.local/share/solana"
export SOLANA_INSTALL_DIR="$PWD/.local/share/solana"
curl --proto '=https' --tlsv1.2 -sSfL https://release.anza.xyz/stable/install | sh

export PATH="$PWD/.local/share/solana/install/active_release/bin:$PATH"
echo
solana --version
cargo-build-sbf --version || true

echo
echo "Building deployable SBF..."
cd solana/shadow-delegated-vault
cargo build-sbf

echo
echo "SYNC SOLANA SBF BUILD COMPLETE"
find target -type f \( -name "*.so" -o -name "*-keypair.json" \) -print
echo "Mainnet execution remains OFF."
