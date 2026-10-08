#!/bin/sh
set -eu
node --check check_sync_v48.mjs
node --no-warnings check_sync_v48.mjs
