# Shadow Delegated Vault — Replit SBF build

This Replit build path no longer depends on GitHub Actions.

GitHub Actions is not part of this build path.

The Replit builder uses:
- existing Agave/cargo-build-sbf 4.3.x already installed in the workspace;
- platform-tools v1.57;
- SBPFv3 (`--arch v3`);
- cargo-build-sbf's own Nix ELF patching;
- an isolated HOME/cache under `.shadow-sbf-home`;
- a recent NixOS package set fetched from `channels.nixos.org`, not GitHub.

The on-chain crate is pinned to Anchor 0.32.1 and intentionally does not add
a separate legacy `solana-program = 1.18.x` dependency.

Run diagnostics only:

`npm run delegated:build:doctor`

Build the `.so`:

`npm run delegated:build:replit`

Expected artifact:

`solana/shadow-delegated-vault/target/deploy/shadow_delegated_vault.so`

The builder validates:
- Program ID integrity;
- source/dependency compatibility;
- Replit disk space;
- cargo-build-sbf flags;
- the Nix dependency set used by the official platform-tools patcher;
- final ELF magic/size/hash;
- SBPF ELF header where llvm-readelf is available.

This does NOT deploy the program, does NOT set the mainnet approval flag,
does NOT restart the Shadow server, and does NOT call GitHub.

Public mainnet autonomous execution remains fail-closed.
