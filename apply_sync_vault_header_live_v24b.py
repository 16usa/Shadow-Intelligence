#!/usr/bin/env python3
from pathlib import Path
import re, shutil

ROOT=Path.cwd()
JS=ROOT/"public/sync.js"
CSS=ROOT/"public/sync.css"
PAYLOAD=ROOT/"sync-v24b-payload.css"
HELPERS=ROOT/"sync-v24b-helpers.js"
MARK="SYNC_VAULT_HEADER_LIVE_V24B"

for p in (JS,CSS,PAYLOAD,HELPERS):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run this from ~/workspace.")

js=JS.read_text()
css=CSS.read_text()
payload=PAYLOAD.read_text()
helpers=HELPERS.read_text()

if MARK in js and MARK in css:
    print("SYNC VAULT HEADER LIVE V24B ALREADY INSTALLED")
    raise SystemExit(0)

js_bak=ROOT/"public/sync.js.bak-vault-header-v24b"
css_bak=ROOT/"public/sync.css.bak-vault-header-v24b"
shutil.copy2(JS,js_bak)
shutil.copy2(CSS,css_bak)

def fail(msg):
    shutil.copy2(js_bak,JS)
    shutil.copy2(css_bak,CSS)
    raise SystemExit("ERROR: "+msg+". Original sync.js/sync.css restored.")

try:
    if MARK not in js:
        m=re.search(r'(\n\s*function\s+roomReady\s*\(\)\s*\{)',js)
        if not m:
            fail("roomReady() anchor not found")
        js=js[:m.start(1)]+"\n"+helpers+js[m.start(1):]

        if "vaultHeaderBusy" not in js:
            m=re.search(r'(\bpushActive\s*:\s*false)(\s*\n\s*\}\s*;)',js,re.M)
            if not m:
                fail("state object anchor not found")
            js=js[:m.start(1)] + m.group(1) + ",\n    vaultHeaderBusy:false,\n    vaultHeaderLast:null" + m.group(2) + js[m.end(2):]

        boot=re.search(r'(async\s+function\s+boot\s*\(\)\s*\{[\s\S]*?await\s+loadSession\s*\(\)\s*;)',js)
        if not boot:
            fail("boot()/loadSession anchor not found")
        insert_at=boot.end(1)
        js=js[:insert_at]+"\n    ensureVaultHeader();\n    await loadVaultHeaderBalance();"+js[insert_at:]

        if "setInterval(loadVaultHeaderBalance,1000);" not in js:
            timer=re.search(r'setInterval\s*\(\s*loadRoom\s*,\s*5000\s*\)\s*;',js)
            if not timer:
                fail("loadRoom interval anchor not found")
            extra='''\n    setInterval(loadVaultHeaderBalance,1000);
    window.addEventListener("pageshow",function(){loadVaultHeaderBalance()});
    document.addEventListener("visibilitychange",function(){
      if(document.visibilityState==="visible")loadVaultHeaderBalance();
    });'''
            js=js[:timer.end()]+extra+js[timer.end():]

    if MARK not in css:
        css=css.rstrip()+"\n\n"+payload.rstrip()+"\n"

    JS.write_text(js)
    CSS.write_text(css)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC VAULT HEADER LIVE V24B INSTALLED")
print("Backups:")
print(" ",js_bak)
print(" ",css_bak)
print("Behavior:")
print("  Right side of SYNC header shows delegated-vault free WSOL.")
print("  Refreshes about once per second while page is visible.")
print("  Refreshes immediately when returning to the page.")
print("  No trading, authorization, TP/SL, policy, key, sizing, or withdrawal logic changed.")
