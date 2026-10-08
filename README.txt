SYNC V38 READ-ONLY diagnostic for pending delegated sessions.
Does not modify application code, database, wallets, policy, vault, or SOL.
Run in project root: unzip -o SYNC_V38_DIAGNOSTIC.zip && sh run_sync_v38.sh
If node:sqlite requires a flag, the runner already supplies it.
Do not share .env, DB, seed keys, full private key, or wallet signatures.
After diagnostics, push only if there are source changes; this diagnostic is safe to commit.
