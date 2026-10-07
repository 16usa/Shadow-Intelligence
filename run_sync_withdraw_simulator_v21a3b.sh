#!/bin/sh
set -eu
echo "SYNC WITHDRAW SIMULATOR V21A3B"
echo "READ-ONLY: simulateTransaction only. NO broadcast."
echo
node simulate_sync_withdraw_v21a3b.mjs | tee SYNC_WITHDRAW_SIMULATOR_V21A3B.txt
echo
echo "DONE. Show/upload SYNC_WITHDRAW_SIMULATOR_V21A3B.txt."
echo "NO FUNDS MOVED."
