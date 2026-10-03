# Shadow Delegated Vault build

The canonical build is `.github/workflows/shadow-delegated-build.yml`.

Why: Replit's Nix runtime was repeatedly failing on prebuilt SBF toolchains
(GLIBC / GLIBCXX / patchelf issues). The canonical SBF compile therefore runs
on a clean Ubuntu 24.04 GitHub runner with official Agave 4.3.0.

Replit remains the Shadow web/backend host.

This workflow builds and uploads the `.so`; it does NOT deploy it.
Mainnet remains fail-closed until the security gate in `SECURITY.md` is met.
