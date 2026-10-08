#!/bin/sh
set -eu
cd "$(dirname "$0")"
node --check diagnose_sync_v38.mjs
node --experimental-sqlite diagnose_sync_v38.mjs
printf '\nREAD-ONLY CHECK COMPLETE. No files or database records changed.\n'
