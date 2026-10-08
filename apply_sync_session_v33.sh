#!/bin/sh
set -eu
python3 apply_sync_session_v33.py
node --check src/internal-copy-engine.mjs
printf '\nPATCH COMPLETE. Manual Replit restart required.\n'
