from pathlib import Path
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
a=s.index('    // V35: Rebind an orphaned session only after verifying the original')
b=s.index('    let row;\n    try{row=ensureSession(canonical)}catch(error){',a)
# V35 rewrites the session subscription_id despite the on-chain PDA being tied to old ID.
# Disable migration, preserve old vault/session, and keep current subscription pending.
s=s[:a]+'''    // V40: Never re-key an existing on-chain PDA to a different subscription ID.
    // A revoked or expired policy must not be treated as recoverable authorization.
    // The original vault remains untouched and available for the separate reclaim flow.
'''+s[b:]
old='''  return policy.sessionKey===row.session_public_key &&
    policy.maxTradeLamports===d.maxTradeLamports &&'''
new='''  return policy.owner===row.owner_address &&
    policy.subscriptionHash===idHash(row.subscription_id).toString('hex') &&
    policy.sessionKey===row.session_public_key &&
    policy.maxTradeLamports===d.maxTradeLamports &&'''
if s.count(old)!=1:raise SystemExit('policyMatches anchor mismatch')
s=s.replace(old,new,1)
old2='''  return policy.sessionKey===row.session_public_key &&
    policy.maxTradeLamports===d.maxTradeLamports &&'''
# policySettingsMatchDesired also must not accept a mismatched identity
if s.count(old2)!=1:raise SystemExit('policySettingsMatchDesired anchor mismatch')
s=s.replace(old2,new,1)
p.write_text(s)
print('V40 fail-closed identity guard installed; no database changes')
