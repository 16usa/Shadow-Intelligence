#!/usr/bin/env python3
from pathlib import Path
import shutil, subprocess, sys

ROOT = Path.cwd()
JS = ROOT / "public/execution-authorize.js"
HTML = ROOT / "public/execution-authorize.html"

for p in (JS, HTML):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

js = JS.read_text(encoding="utf-8")
html = HTML.read_text(encoding="utf-8")

if "SYNC_WALLET_DOUBLE_PROMPT_FIX_V32B" in js:
    print("SYNC WALLET DOUBLE PROMPT FIX V32B ALREADY INSTALLED")
    raise SystemExit(0)

js_bak = ROOT / "public/execution-authorize.js.bak-wallet-double-prompt-v32b"
html_bak = ROOT / "public/execution-authorize.html.bak-wallet-double-prompt-v32b"
shutil.copy2(JS, js_bak)
shutil.copy2(HTML, html_bak)

def restore(msg):
    shutil.copy2(js_bak, JS)
    shutil.copy2(html_bak, HTML)
    raise SystemExit("ERROR: " + msg + ". Originals restored.")

sign_pos = js.find("async function sign()")
if sign_pos < 0:
    restore("sign() function not found")

# Limit edits to the sign() area so another wallet flow cannot be touched.
listener_pos = js.find("$('#actionBtn').addEventListener('click',sign)", sign_pos)
if listener_pos < 0:
    restore("action button listener not found after sign()")

sign_block = js[sign_pos:listener_pos]

# Main fix: do not request a fresh wallet connection when Phantom/Solflare
# is already connected. This is the source of the extra approval sheet.
if "await p.connect();" not in sign_block:
    restore("wallet connect call not found inside sign()")

sign_block = sign_block.replace(
    "await p.connect();",
    "/* SYNC_WALLET_DOUBLE_PROMPT_FIX_V32B */if(!p.isConnected&&!p.publicKey)await p.connect();",
    1
)

# Add an in-flight guard if this exact minified function shape is available.
if "async function sign(){const p=provider();" in sign_block:
    sign_block = sign_block.replace(
        "async function sign(){const p=provider();",
        "let walletActionInFlight=false;async function sign(){if(walletActionInFlight)return;walletActionInFlight=true;const p=provider();",
        1
    )
    # If there is no provider, unlock before returning.
    sign_block = sign_block.replace(
        "if(!p){status('Open this page inside Phantom or Solflare so the owner wallet can sign.');return}",
        "if(!p){walletActionInFlight=false;status('Open this page inside Phantom or Solflare so the owner wallet can sign.');return}",
        1
    )
    # Existing catch is a stable small anchor. Unlock there.
    catch_anchor = "catch(e){status(e.message);$('#status').className='status bad';$('#actionBtn').disabled=false}"
    if catch_anchor in sign_block:
        sign_block = sign_block.replace(
            catch_anchor,
            "catch(e){walletActionInFlight=false;status(e.message);$('#status').className='status bad';$('#actionBtn').disabled=false}",
            1
        )
    # Unlock successful path immediately before returning result.
    success_anchor = "return result /* SYNC_AUTH_STATE_FIX_V25 */"
    if success_anchor in sign_block:
        sign_block = sign_block.replace(
            success_anchor,
            "walletActionInFlight=false;return result /* SYNC_AUTH_STATE_FIX_V25 */",
            1
        )

js = js[:sign_pos] + sign_block + js[listener_pos:]

# Cache/version bump. Handle any existing ?v= value robustly.
import re
html2, n = re.subn(
    r'/execution-authorize\.js\?v=[^"\']+',
    '/execution-authorize.js?v=3.4.1-v32b',
    html,
    count=1
)
if n == 0:
    html2 = html.replace(
        '/execution-authorize.js',
        '/execution-authorize.js?v=3.4.1-v32b',
        1
    )
html = html2

JS.write_text(js, encoding="utf-8")
HTML.write_text(html, encoding="utf-8")

check = subprocess.run(
    ["node", "--check", str(JS)],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)
if check.returncode != 0:
    shutil.copy2(js_bak, JS)
    shutil.copy2(html_bak, HTML)
    print(check.stdout)
    raise SystemExit("ERROR: node --check failed. Originals restored.")

verify = JS.read_text(encoding="utf-8")
if "SYNC_WALLET_DOUBLE_PROMPT_FIX_V32B" not in verify:
    restore("verification marker missing")
if "if(!p.isConnected&&!p.publicKey)await p.connect();" not in verify:
    restore("conditional connect verification failed")

print("SYNC WALLET DOUBLE PROMPT FIX V32B INSTALLED")
print("Backups:")
print(" ", js_bak)
print(" ", html_bak)
print("")
print("Fix:")
print("  - connected Phantom/Solflare no longer gets wallet.connect() again")
print("  - the actual policy transaction still uses one signAndSendTransaction()")
print("  - in-flight guard added when the current sign() shape supports it")
print("  - execution-authorize.js version bumped")
print("  - no backend, vault, policy, balance or trading logic changed")
print("")
print("Manual Replit restart required once.")
