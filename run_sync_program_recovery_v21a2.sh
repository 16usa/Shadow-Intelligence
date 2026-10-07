#!/bin/sh
set -eu

echo "SYNC PROGRAM RECOVERY V21A2"
echo "READ-ONLY: NO transaction, NO signature, NO funds moved."
echo

node recover_sync_program_v21a2.mjs | tee SYNC_PROGRAM_RECOVERY_V21A2.txt

echo
echo "FILES:"
ls -lh SYNC_PROGRAM_RECOVERY_V21A2.txt SYNC_DEPLOYED_PROGRAM_CURRENT.so 2>/dev/null || true
ls -lh SYNC_DEPLOYED_IDL.json SYNC_DEPLOYED_IDL_ACCOUNT.bin 2>/dev/null || true
echo
echo "DONE. Upload/show SYNC_PROGRAM_RECOVERY_V21A2.txt."
