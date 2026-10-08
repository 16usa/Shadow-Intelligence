from pathlib import Path
import re, subprocess, tempfile, os
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
original=s
start='    // V35: Rebind an orphaned session only after verifying the original'
end='    let row;\n    try{row=ensureSession(canonical)}catch(error){'
if 'V40_FIXED_FAIL_CLOSED' not in s:
    if s.count(start)!=1 or s.count(end)!=1:
        raise SystemExit('ABORT: V35 block anchors missing or ambiguous; no changes')
    a=s.index(start); b=s.index(end,a)
    s=s[:a]+'''    // V40_FIXED_FAIL_CLOSED: Never migrate a session to a different subscription ID.
    // Existing vault and on-chain policy remain untouched pending explicit recovery.
'''+s[b:]
pattern=r'(function (?:policyMatches|policySettingsMatchDesired)\([^\n]+\)\{[\s\S]*?\n  return )policy\.sessionKey===row\.session_public_key &&'
def replace(m):
    return m.group(1)+'''policy.owner===row.owner_address &&
    policy.subscriptionHash===idHash(row.subscription_id).toString('hex') &&
    policy.sessionKey===row.session_public_key &&'''
if 'V40_FIXED_FAIL_CLOSED' in original:
    print('V40 fix already installed; checking syntax')
else:
    updated,n=re.subn(pattern,replace,s,count=2)
    if n!=2: raise SystemExit(f'ABORT: expected 2 policy guards; found {n}; no changes')
    s=updated
    if s.count('policy.subscriptionHash===idHash(row.subscription_id)')!=2:
        raise SystemExit('ABORT: policy guard count mismatch; no changes')
if s==original:
    print('No source changes required')
else:
    fd,tmp=tempfile.mkstemp(suffix='.mjs',dir=str(p.parent))
    try:
        with os.fdopen(fd,'w') as f:f.write(s)
        subprocess.run(['node','--check',tmp],check=True)
        os.replace(tmp,p)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    print('V40 corrected safety patch applied; syntax verified; no database modifications')
