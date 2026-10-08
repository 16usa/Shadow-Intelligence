SYNC V40 FIX — corrects failed anchor matching from previous V40 installer.
- Removes V35 automatic session-ID migration; old vault unchanged.
- Validates policy owner and original subscription hash in both policy comparison paths.
- Does NOT activate revoked or expired policies, trade, deploy, sign, or alter database.
- Installation aborts without writing if source anchors differ.
- Restart only when you decide to activate the updated server code.
