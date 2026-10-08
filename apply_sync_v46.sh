#!/bin/sh
set -eu
python3 apply_sync_v46.py
node --check src/sync-vault-reclaim.mjs
