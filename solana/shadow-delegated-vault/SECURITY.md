# Shadow Delegated Vault — security gate

This program source is a **review candidate**, not a statement of audit or production certification.

Mainnet must remain disabled until:

1. the program builds reproducibly with the final Solana/Anchor toolchain;
2. PDA derivation and IDL are frozen;
3. Jupiter CPI account mapping is integration-tested against the exact deployed Jupiter program/version;
4. adversarial tests cover extra writable vault accounts, fake token accounts, replay, expiry, daily rollover, malformed route data, Token-2022 behavior, account substitution and revoke races;
5. WSOL wrapping/unwrapping, vault token-account creation/closure, rent handling and fee-payer behavior are finalized and tested;
6. an independent Solana smart-contract security review/audit is completed;
7. the audited binary hash/program id is recorded and `SHADOW_DELEGATED_MAINNET_APPROVED=true` is set only for that deployment.

The web app is intentionally fail-closed on mainnet without that explicit approval flag.
