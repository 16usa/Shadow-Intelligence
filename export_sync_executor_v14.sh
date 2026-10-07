#!/bin/sh
set -e
python3 sync_export_executor_v14.py
echo "SYNC EXECUTOR EXPORT COMPLETE"
echo "Upload SYNC_EXECUTOR_V14_CURRENT.zip back to ChatGPT."
