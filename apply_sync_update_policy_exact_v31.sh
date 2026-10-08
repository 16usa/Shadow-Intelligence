#!/usr/bin/env bash
set -euo pipefail
cd "${HOME}/workspace" 2>/dev/null || cd /home/runner/workspace 2>/dev/null || true
python3 ./apply_sync_update_policy_exact_v31.py
