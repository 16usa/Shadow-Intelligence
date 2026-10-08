#!/usr/bin/env python3
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path.cwd()
JS = ROOT / "public/execution-authorize.js"
HTML = ROOT / "public/execution-authorize.html"
MARK = "SYNC_WALLET_DOUBLE_PROMPT_FIX_V32"

for p in (JS, HTML):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

js = JS.read_text()
html = HTML.read_text()

if MARK in js:
    print("SYNC WALLET DOUBLE PROMPT FIX V32 ALREADY INSTALLED")
    raise SystemExit(0)

js_bak = ROOT / "public/execution-authorize.js.bak-wallet-double-prompt-v32"
html_bak = ROOT / "public/execution-authorize.html.bak-wallet-double-prompt-v32"
shutil.copy2(JS, js_bak)
shutil.copy2(HTML, html_bak)

def restore():
    shutil.copy2(js_bak, JS)
    shutil.copy2(html_bak, HTML)

old_start = """  async function sign(){const p=provider();if(!p){status('Open this page inside Phantom or Solflare so the owner wallet can sign.');return}$('#actionBtn').disabled=true;try{await p.connect();const prep=await api('/api/copy-engine/authorization/prepare',{method:'POST',body:JSON.stringify({token,action:mode})});"""

new_start = """  /* SYNC_WALLET_DOUBLE_PROMPT_FIX_V32 */
  let walletActionInFlight=false;
  async function sign(){
    if(walletActionInFlight)return;
    const p=provider();
    if(!p){
      status('Open this page inside Phantom or Solflare so the owner wallet can sign.');
      return;
    }

    walletActionInFlight=true;
    $('#actionBtn').disabled=true;

    try{
      // Do NOT call wallet.connect() again when Phantom/Solflare is already
      // connected. The old flow did:
      //   connect() -> signAndSendTransaction()
      // which can show two consecutive wallet approval sheets.
      if(!p.isConnected && !p.publicKey){
        await p.connect();
      }

      const prep=await api('/api/copy-engine/authorization/prepare',{method:'POST',body:JSON.stringify({token,action:mode})});"""

if old_start not in js:
    restore()
    raise SystemExit("ERROR: sign() anchor not found. Originals restored.")

js = js.replace(old_start, new_start, 1)

old_end = """      return result /* SYNC_AUTH_STATE_FIX_V25 */}catch(e){status(e.message);$('#status').className='status bad';$('#actionBtn').disabled=false}}"""

new_end = """      return result /* SYNC_AUTH_STATE_FIX_V25 */
    }catch(e){
      status(e.message);
      $('#status').className='status bad';
      $('#actionBtn').disabled=false;
    }finally{
      walletActionInFlight=false;
    }
  }
  /* SYNC_WALLET_DOUBLE_PROMPT_FIX_V32_END */"""

if old_end not in js:
    restore()
    raise SystemExit("ERROR: sign() end anchor not found. Originals restored.")

js = js.replace(old_end, new_end, 1)

# Bust any stale browser copy even though the server currently sends no-store.
html = html.replace(
    '/execution-authorize.js?v=3.4.0',
    '/execution-authorize.js?v=3.4.1-v32'
)

JS.write_text(js)
HTML.write_text(html)

check = subprocess.run(
    ["node", "--check", str(JS)],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)
if check.returncode != 0:
    restore()
    print(check.stdout)
    raise SystemExit("ERROR: node --check failed. Originals restored.")

verify = JS.read_text()
required = [
    MARK,
    "walletActionInFlight",
    "if(!p.isConnected && !p.publicKey)",
    "finally"
]
missing = [x for x in required if x not in verify]
if missing:
    restore()
    raise SystemExit("ERROR: verification failed: " + ", ".join(missing) + ". Originals restored.")

print("SYNC WALLET DOUBLE PROMPT FIX V32 INSTALLED")
print("Backups:")
print(" ", js_bak)
print(" ", html_bak)
print("")
print("Fix:")
print("  - removes redundant wallet.connect() when wallet is already connected")
print("  - keeps exactly one signAndSendTransaction request for the policy transaction")
print("  - adds an in-flight lock so double taps cannot create a second signing request")
print("  - bumps execution-authorize.js version")
print("  - no backend, vault, policy, balances, TP/SL or copy sizing logic changed")
print("")
print("Manual Replit restart required once.")
