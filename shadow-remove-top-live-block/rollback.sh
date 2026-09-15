#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"

MARKER=".shadow-last-remove-top-live-block-backup"
[[ -f "$MARKER" ]] || { echo "ERROR: backup marker not found"; exit 1; }

B="$(cat "$MARKER")"

if [[ -d "$B/public" ]]; then
  while IFS= read -r -d '' src; do
    rel="${src#"$B/"}"
    mkdir -p "$(dirname "$rel")"
    cp "$src" "$rel"
  done < <(find "$B/public" -type f -print0)
fi

echo "Rollback complete. Refresh Safari."
