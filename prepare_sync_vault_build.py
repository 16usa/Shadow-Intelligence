from pathlib import Path
import re

cargo=Path("solana/shadow-delegated-vault/Cargo.toml")
lib=Path("solana/shadow-delegated-vault/src/lib.rs")
if not cargo.exists() or not lib.exists():
    raise SystemExit("ERROR: delegated vault source missing")

# Keep this stage build-only/fail-closed. It must never silently enable mainnet.
print("Delegated vault source found.")
