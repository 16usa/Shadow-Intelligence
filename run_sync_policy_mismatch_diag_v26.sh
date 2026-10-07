#!/bin/sh
set -eu
node sync_policy_mismatch_diag_v26.mjs | tee SYNC_POLICY_MISMATCH_DIAG_V26.txt
echo
echo "Saved: SYNC_POLICY_MISMATCH_DIAG_V26.txt"
