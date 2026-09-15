#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/workspace}"

B="$(cat .shadow-last-remove-top-live-block-v271-backup)"

if [[ -d "$B/public" ]]; then
  while IFS= read -r -d '' src; do
    rel="${src#"$B/"}"
    mkdir -p "$(dirname "$rel")"
    cp "$src" "$rel"
  done < <(find "$B/public" -type f -print0)
fi

rm -f public/si-remove-top-live-card.js

echo "Rollback complete. Refresh Safari."
