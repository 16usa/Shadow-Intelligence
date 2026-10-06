#!/usr/bin/env bash
# === SHADOW_PROGRAM_KEYPAIR_PIN_GUARD_v3.9.7 ===
SHADOW_PIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHADOW_CANONICAL_PROGRAM_KEYPAIR="$SHADOW_PIN_ROOT/.shadow-program-keys/shadow_delegated_vault-keypair.json"
SHADOW_TARGET_PROGRAM_KEYPAIR="$SHADOW_PIN_ROOT/solana/shadow-delegated-vault/target/deploy/shadow_delegated_vault-keypair.json"

shadow_restore_program_keypair() {
  if [ -f "$SHADOW_CANONICAL_PROGRAM_KEYPAIR" ]; then
    mkdir -p "$(dirname "$SHADOW_TARGET_PROGRAM_KEYPAIR")"
    cp -f "$SHADOW_CANONICAL_PROGRAM_KEYPAIR" "$SHADOW_TARGET_PROGRAM_KEYPAIR"
    chmod 600 "$SHADOW_TARGET_PROGRAM_KEYPAIR" 2>/dev/null || true
  fi
}

shadow_program_keypair_exit_guard() {
  rc=$?
  shadow_restore_program_keypair || true
  return "$rc"
}

shadow_restore_program_keypair
trap shadow_program_keypair_exit_guard EXIT
# === END SHADOW_PROGRAM_KEYPAIR_PIN_GUARD_v3.9.7 ===

set -Eeuo pipefail

MODE="${1:-build}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# v3.8.8 EARLY RUSTUP SHIM BOOTSTRAP
RUSTUP_SHIM_DIR="${RUSTUP_SHIM_DIR:-$ROOT/.shadow-toolchain/cargo/bin}"
RUSTUP_STORE="${RUSTUP_STORE:-$ROOT/.shadow-toolchain/rustup}"
CARGO_SHIM="${CARGO_SHIM:-$RUSTUP_SHIM_DIR/cargo}"
RUSTUP_SHIM="${RUSTUP_SHIM:-$RUSTUP_SHIM_DIR/rustup}"

PROJ="$ROOT/solana/shadow-delegated-vault"
PROGRAM="$PROJ/programs/shadow_delegated_vault"
PROGRAM_ID="HGFPeTaz4C3EVz3k4UBAB11g73FxaTAmaKxEQg4SAXpA"
TOOLS_VERSION="v1.57"
ARCH="v3"
BUILD_HOME="$ROOT/.shadow-sbf-home"
LOG_DIR="$ROOT/.shadow-build-logs"
mkdir -p "$BUILD_HOME" "$LOG_DIR"
LOG="$LOG_DIR/delegated-sbf-$(date -u +%Y%m%d-%H%M%S).log"

exec > >(tee "$LOG") 2>&1

fail() {
  echo
  echo "BUILD_STOPPED"
  echo "Reason: $*"
  echo "Log: $LOG"
  exit 1
}

onerr() {
  rc=$?
  echo
  echo "BUILD_FAILED rc=$rc"
  echo "Log: $LOG"
  exit "$rc"
}
trap onerr ERR

echo "=== SHADOW REPLIT SBF BUILDER v3.8.0 ==="
echo "Root: $ROOT"
echo "Mode: $MODE"
echo "GitHub CI: disabled / unused"
echo "Target architecture: SBPF${ARCH#v}"
echo "Platform tools: $TOOLS_VERSION"

[ -d "$PROJ" ] || fail "delegated project directory missing"
[ -f "$PROGRAM/Cargo.toml" ] || fail "program Cargo.toml missing"
[ -f "$PROGRAM/src/lib.rs" ] || fail "program lib.rs missing"
[ -f "$PROJ/Anchor.toml" ] || fail "Anchor.toml missing"

echo
echo "=== PHASE 0: SOURCE INTEGRITY ==="
grep -q "declare_id!(\"$PROGRAM_ID\")" "$PROGRAM/src/lib.rs" || fail "lib.rs Program ID mismatch"
COUNT="$(grep -Foc "$PROGRAM_ID" "$PROJ/Anchor.toml" || true)"
[ "$COUNT" -ge 2 ] || fail "Anchor.toml Program ID mismatch"
grep -q 'anchor-lang = "=0.32.1"' "$PROGRAM/Cargo.toml" || fail "Anchor 0.32.1 pin missing"
grep -q 'anchor-spl = { version = "=0.32.1"' "$PROGRAM/Cargo.toml" || fail "anchor-spl 0.32.1 pin missing"
if grep -Eq '^[[:space:]]*(solana-program|spl-token)[[:space:]]*=' "$PROGRAM/Cargo.toml"; then
  fail "legacy direct Solana/SPL dependency still present"
fi
echo "PROGRAM_ID_OK=$PROGRAM_ID"
echo "ANCHOR_DEPENDENCIES_OK"

echo
echo "=== PHASE 1: REPLIT PRE-FLIGHT ==="
FREE_KB="$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')"
FREE_GB="$((FREE_KB/1024/1024))"
echo "Workspace free: ${FREE_GB} GB"
[ "$FREE_GB" -ge 6 ] || fail "need at least 6 GB free in workspace"

for cmd in node python3 curl nix-instantiate nix-build sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || fail "required command missing: $cmd"
done

CARGO_BUILD_SBF=""
for candidate in \
  "$ROOT/.shadow-toolchain/agave-v4.3.0/bin/cargo-build-sbf" \
  "$ROOT/.shadow-toolchain/agave-v4.3.0/bin/cargo-build-sbf-4.3.0" \
  "$(command -v cargo-build-sbf 2>/dev/null || true)" \
  "$HOME/.local/share/solana/install/active_release/bin/cargo-build-sbf"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    CARGO_BUILD_SBF="$candidate"
    break
  fi
done
[ -n "$CARGO_BUILD_SBF" ] || fail "cargo-build-sbf not found; existing Agave toolchain is missing"

echo "cargo-build-sbf: $CARGO_BUILD_SBF"
HELP="$("$CARGO_BUILD_SBF" --help 2>&1 || true)"
printf '%s\n' "$HELP" | grep -q -- '--patch-binaries-for-nix' || fail "cargo-build-sbf lacks --patch-binaries-for-nix"
printf '%s\n' "$HELP" | grep -q -- '--no-rustup-override' || fail "cargo-build-sbf lacks --no-rustup-override"
printf '%s\n' "$HELP" | grep -q -- '--tools-version' || fail "cargo-build-sbf lacks --tools-version"
printf '%s\n' "$HELP" | grep -q -- '--arch' || fail "cargo-build-sbf lacks --arch"
echo "CARGO_BUILD_SBF_FLAGS_OK"

ORIGINAL_HOME="$HOME"
HOST_CARGO=""
HOST_CARGO_DIR=""
HOST_CARGO_HOME=""
HOST_RUSTUP_HOME=""

try_direct_cargo() {
  local candidate="$1"
  [ -x "$candidate" ] || return 1
  local bindir
  bindir="$(dirname "$candidate")"
  if env PATH="$bindir:$PATH" "$candidate" --version >/dev/null 2>&1; then
    HOST_CARGO="$candidate"
    HOST_CARGO_DIR="$bindir"
    return 0
  fi
  return 1
}

try_rustup_cargo() {
  local candidate="$1"
  local cargo_home="$2"
  local rustup_home="$3"
  [ -x "$candidate" ] || return 1
  [ -d "$rustup_home" ] || return 1
  if env CARGO_HOME="$cargo_home" RUSTUP_HOME="$rustup_home" "$candidate" --version >/dev/null 2>&1; then
    HOST_CARGO="$candidate"
    HOST_CARGO_DIR="$(dirname "$candidate")"
    HOST_CARGO_HOME="$cargo_home"
    HOST_RUSTUP_HOME="$rustup_home"
    return 0
  fi
  return 1
}

echo "--- locating known-good Cargo ---"

# Prefer the real Cargo binary inside the isolated stable toolchain that was
# previously installed in this workspace. This bypasses Replit/Nix command
# discovery entirely.
for candidate in   "$ROOT"/.shadow-toolchain/rustup/toolchains/stable-*/bin/cargo   "$ROOT"/.shadow-toolchain/rustup/toolchains/*/bin/cargo   "$ORIGINAL_HOME"/.rustup/toolchains/stable-*/bin/cargo   "$ORIGINAL_HOME"/.rustup/toolchains/*/bin/cargo
do
  if try_direct_cargo "$candidate"; then
    break
  fi
done

# Fallback to rustup shims, but supply the matching rustup home explicitly.
if [ -z "$HOST_CARGO" ]; then
  try_rustup_cargo     "$ROOT/.shadow-toolchain/cargo/bin/cargo"     "$ROOT/.shadow-toolchain/cargo"     "$ROOT/.shadow-toolchain/rustup" || true
fi

if [ -z "$HOST_CARGO" ]; then
  try_rustup_cargo     "$ORIGINAL_HOME/.cargo/bin/cargo"     "$ORIGINAL_HOME/.cargo"     "$ORIGINAL_HOME/.rustup" || true
fi

# Last fallback: a cargo already exported by the shell.
if [ -z "$HOST_CARGO" ]; then
  SHELL_CARGO="$(command -v cargo 2>/dev/null || true)"
  if [ -n "$SHELL_CARGO" ]; then
    try_direct_cargo "$SHELL_CARGO" || true
  fi
fi

if [ -z "$HOST_CARGO" ]; then
  echo "Cargo candidates seen:"
  find "$ROOT/.shadow-toolchain" "$ORIGINAL_HOME/.cargo" "$ORIGINAL_HOME/.rustup"     -type f -name cargo -perm -111 2>/dev/null | head -40 || true
  fail "no runnable Cargo found in the existing Shadow toolchain"
fi

echo "Host cargo: $HOST_CARGO"
env PATH="$HOST_CARGO_DIR:$PATH"   ${HOST_RUSTUP_HOME:+RUSTUP_HOME="$HOST_RUSTUP_HOME"}   "$HOST_CARGO" --version

echo
echo "=== PHASE 2: ISOLATED BUILD HOME ==="
mkdir -p "$BUILD_HOME/.cache/solana" "$BUILD_HOME/.cargo"
export HOME="$BUILD_HOME"
export CARGO_HOME="$BUILD_HOME/.cargo"
export CARGO="$CARGO_SHIM"
if [ -n "$HOST_RUSTUP_HOME" ] && [ -d "$HOST_RUSTUP_HOME" ]; then
  export RUSTUP_HOME="$HOST_RUSTUP_HOME"
else
  unset RUSTUP_HOME || true
fi
export CARGO_NET_GIT_FETCH_WITH_CLI=true
export CARGO_TERM_COLOR=always
export RUST_BACKTRACE=1
PLATFORM_DIR="$HOME/.cache/solana/$TOOLS_VERSION/platform-tools"
unset RUSTC || true
export PATH="$RUSTUP_SHIM_DIR:$PATH"
echo "Build HOME: $HOME"
echo "Platform dir: $PLATFORM_DIR"
echo "Pinned CARGO: $CARGO"

# v3.8.10 SELF-CONTAINED HOST CARGO/RUSTUP ENV
RUSTUP_SHIM_DIR="${RUSTUP_SHIM_DIR:-$ROOT/.shadow-toolchain/cargo/bin}"
RUSTUP_STORE="${RUSTUP_STORE:-$ROOT/.shadow-toolchain/rustup}"
CARGO_SHIM="${CARGO_SHIM:-$RUSTUP_SHIM_DIR/cargo}"
RUSTUP_SHIM="${RUSTUP_SHIM:-$RUSTUP_SHIM_DIR/rustup}"

[ -x "$CARGO_SHIM" ] || fail "cargo rustup shim missing: $CARGO_SHIM"
[ -x "$RUSTUP_SHIM" ] || fail "rustup binary missing: $RUSTUP_SHIM"
[ -d "$RUSTUP_STORE" ] || fail "rustup store missing: $RUSTUP_STORE"

export RUSTUP_HOME="$RUSTUP_STORE"
HOST_STABLE_TOOLCHAIN="$("$RUSTUP_SHIM" toolchain list 2>/dev/null | awk '$1 ~ /^stable/ {print $1; exit}')"
[ -n "$HOST_STABLE_TOOLCHAIN" ] || fail "no installed stable toolchain found in $RUSTUP_HOME"
export RUSTUP_TOOLCHAIN="$HOST_STABLE_TOOLCHAIN"
export CARGO="$CARGO_SHIM"
export PATH="$RUSTUP_SHIM_DIR:$PATH"
unset RUSTC || true

echo "HOST_RUSTUP_ENV_OK"
echo "RUSTUP_HOME=$RUSTUP_HOME"
echo "RUSTUP_TOOLCHAIN=$RUSTUP_TOOLCHAIN"

echo "--- cargo metadata spawn self-test ---"
echo "Cargo executable: $CARGO"
"$RUSTUP_SHIM" toolchain list
"$CARGO" --version
"$CARGO" metadata   --format-version 1   --no-deps   --manifest-path "$PROJ/Cargo.toml"   >/dev/null
echo "CARGO_METADATA_SPAWN_OK"

echo
echo "=== PHASE 3: MODERN NIX RUNTIME FOR OFFICIAL PATCHER ==="
NIXPKGS_URL="${SHADOW_NIXPKGS_URL:-https://channels.nixos.org/nixos-24.11/nixexprs.tar.xz}"
echo "Nixpkgs source: $NIXPKGS_URL"
NIXPKGS_PATH="$(
  nix-instantiate --eval --strict --expr "builtins.fetchTarball \"$NIXPKGS_URL\"" \
    | tr -d '"'
)"
[ -d "$NIXPKGS_PATH" ] || fail "Nixpkgs tarball did not resolve to a directory"
export NIX_PATH="nixpkgs=$NIXPKGS_PATH"
echo "NIX_PATH=$NIX_PATH"

RUNTIME_LINK="$ROOT/.shadow-sbf-runtime"
rm -f "$RUNTIME_LINK"
nix-build --no-build-output -E '
with (import <nixpkgs> {});
symlinkJoin {
  name = "shadow-solana-sbf-dependencies";
  paths = [
    libedit
    python3
    ncurses
    zlib
    xz.out
    libxml2.out
    patchelf
    stdenv.cc.bintools
    libgcc.lib
  ];
}
' -o "$RUNTIME_LINK" >/dev/null
[ -x "$RUNTIME_LINK/bin/patchelf" ] || fail "modern Nix runtime lacks patchelf"
[ -f "$RUNTIME_LINK/nix-support/dynamic-linker" ] || fail "modern Nix runtime lacks dynamic linker metadata"
echo "NIX_RUNTIME_OK"
echo "Dynamic linker: $(cat "$RUNTIME_LINK/nix-support/dynamic-linker")"

if [ "$MODE" = "doctor" ]; then
  echo
  echo "=== DOCTOR RESULT ==="
  echo "DOCTOR_PASS"
  echo "No build was started."
  echo "No server restart was performed."
  echo "No GitHub command was run."
  echo "No Solana deploy was performed."
  echo "Log: $LOG"
  exit 0
fi

[ "$MODE" = "build" ] || fail "unknown mode: $MODE"

echo
echo "=== PHASE 4: CLEAN ONLY DELEGATED BUILD OUTPUT ==="
rm -rf "$PROJ/target/deploy"
mkdir -p "$PROJ/target/deploy"
rm -rf "$HOME/.cache/solana/$TOOLS_VERSION"
echo "DELEGATED_BUILD_OUTPUT_CLEAN"

echo
RUSTUP_SHIM_DIR="$ROOT/.shadow-toolchain/cargo/bin"
RUSTUP_STORE="$ROOT/.shadow-toolchain/rustup"
CARGO_SHIM="$RUSTUP_SHIM_DIR/cargo"
RUSTUP_SHIM="$RUSTUP_SHIM_DIR/rustup"

[ -x "$CARGO_SHIM" ] || fail "rustup cargo shim missing: $CARGO_SHIM"
[ -x "$RUSTUP_SHIM" ] || fail "rustup binary missing: $RUSTUP_SHIM"
[ -d "$RUSTUP_STORE" ] || fail "rustup toolchain store missing: $RUSTUP_STORE"

export RUSTUP_HOME="$RUSTUP_STORE"

# v3.8.9: explicitly select an already-installed stable host toolchain.
HOST_STABLE_TOOLCHAIN="$("$RUSTUP_SHIM" toolchain list 2>/dev/null | awk '$1 ~ /^stable/ {print $1; exit}')"
[ -n "$HOST_STABLE_TOOLCHAIN" ] || fail "installed stable rustup toolchain not found in $RUSTUP_HOME"
export RUSTUP_TOOLCHAIN="$HOST_STABLE_TOOLCHAIN"
echo "Host rustup toolchain: $RUSTUP_TOOLCHAIN"
export PATH="$RUSTUP_SHIM_DIR:$PATH"
export CARGO="$CARGO_SHIM"

"$RUSTUP_SHIM" toolchain list >/dev/null
"$CARGO_SHIM" --version >/dev/null
echo "RUSTUP_SHIMS_OK"

echo "cargo in PATH: $(command -v cargo)"
echo "rustup in PATH: $(command -v rustup)"
echo "SBPF_RUSTUP_TOOLCHAIN_MODE_OK"
echo "=== HOST RUSTUP TOOLCHAIN CHECK ==="
"$CARGO_SHIM" --version >/dev/null
echo "HOST_RUSTUP_TOOLCHAIN_OK"
# v3.8.10 REASSERT RUSTUP ENV FOR cargo-build-sbf CHILDREN
export RUSTUP_HOME="$RUSTUP_STORE"
export RUSTUP_TOOLCHAIN="$HOST_STABLE_TOOLCHAIN"
export CARGO="$CARGO_SHIM"
export PATH="$RUSTUP_SHIM_DIR:$PATH"
unset RUSTC || true
echo "SBPF_CHILD_RUSTUP_ENV_OK"
echo "=== PHASE 5: SBPFv3 BUILD ==="
cd "$PROJ"

BUILD_ARGS=(
  --arch "$ARCH"
  --tools-version "$TOOLS_VERSION"
  --patch-binaries-for-nix
  --generate-child-script-on-failure
)

echo "Command: $CARGO_BUILD_SBF ${BUILD_ARGS[*]}"
echo "cargo-build-sbf child CARGO=$CARGO"
[ -x "$CARGO" ] || fail "CARGO became unavailable before SBF build: $CARGO"
"$CARGO_BUILD_SBF" "${BUILD_ARGS[@]}"

cd "$ROOT"

ARTIFACT="$PROJ/target/deploy/shadow_delegated_vault.so"
[ -f "$ARTIFACT" ] || fail "build returned success but .so was not created"
BYTES="$(wc -c < "$ARTIFACT" | tr -d ' ')"
[ "$BYTES" -gt 0 ] || fail "artifact is empty"
MAGIC="$(od -An -tx1 -N4 "$ARTIFACT" | tr -d ' \n')"
[ "$MAGIC" = "7f454c46" ] || fail "artifact is not ELF"

echo
echo "=== PHASE 6: ARTIFACT VERIFICATION ==="
echo "Artifact: $ARTIFACT"
echo "Bytes: $BYTES"
echo "SHA256: $(sha256sum "$ARTIFACT" | awk '{print $1}')"

READELF="$PLATFORM_DIR/llvm/bin/llvm-readelf"
if [ -x "$READELF" ]; then
  echo "--- ELF HEADER ---"
  "$READELF" -h "$ARTIFACT" | sed -n '1,30p'
  echo "--- ELF FLAGS ---"
  "$READELF" -h "$ARTIFACT" | grep -E 'Machine:|Flags:' || true
fi

if [ -f "$ROOT/scripts/verify-delegated-artifact.mjs" ]; then
  node "$ROOT/scripts/verify-delegated-artifact.mjs"
fi

echo
echo "=== BUILD RESULT ==="
echo "SHADOW_DELEGATED_SBF_BUILD_OK"
echo "SHADOW_DELEGATED_ARTIFACT=$ARTIFACT"
echo "Mainnet approval was NOT changed."
echo "No server restart was performed."
echo "No GitHub command was run."
echo "No Solana deploy was performed."
echo "Log: $LOG"
