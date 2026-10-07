#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
HTML=ROOT/"public/execution-authorize.html"
JS=ROOT/"public/execution-authorize.js"
MARK="SYNC_AUTH_NAV_FIX_V22"

for p in (HTML,JS):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

html=HTML.read_text()
js=JS.read_text()

if MARK in html and MARK in js:
    print("SYNC AUTH NAV FIX V22 ALREADY INSTALLED")
    raise SystemExit(0)

html_bak=ROOT/"public/execution-authorize.html.bak-auth-nav-v22"
js_bak=ROOT/"public/execution-authorize.js.bak-auth-nav-v22"
shutil.copy2(HTML,html_bak)
shutil.copy2(JS,js_bak)

def fail(msg):
    shutil.copy2(html_bak,HTML)
    shutil.copy2(js_bak,JS)
    raise SystemExit("ERROR: "+msg+". Originals restored.")

try:
    # 1) Make the visible back arrow deterministic: always return to SYNC main page.
    old_back='<a class="back" href="javascript:history.back()">‹</a>'
    new_back='<a class="back" href="/sync.html" aria-label="Back to SYNC">‹</a><!-- SYNC_AUTH_NAV_FIX_V22 -->'
    if MARK not in html:
        if old_back not in html:
            fail("back arrow anchor not found")
        html=html.replace(old_back,new_back,1)

    # 2) Replace window.close() after successful authorization/revoke.
    #    Phantom/Solflare in-app browser frequently cannot close a page it did not open.
    old_success="""$('#status').className='status good';setTimeout(()=>{try{window.close()}catch{}},1200);return result"""
    new_success="""$('#status').className='status good';/* SYNC_AUTH_NAV_FIX_V22 */setTimeout(()=>{location.replace('/sync.html')},900);return result"""
    if MARK not in js:
        if old_success not in js:
            fail("success navigation anchor not found")
        js=js.replace(old_success,new_success,1)

    # 3) Add a safe fallback helper so any future manual navigation can use the same route.
    #    Keep this tiny and independent of browser history.
    helper_anchor="const status=t=>{$('#status').textContent=t};"
    helper="""const status=t=>{$('#status').textContent=t};
  const backToSync=()=>{location.href='/sync.html'}; // SYNC_AUTH_NAV_FIX_V22
"""
    if "const backToSync=" not in js:
        if helper_anchor not in js:
            fail("status helper anchor not found")
        js=js.replace(helper_anchor,helper,1)

    HTML.write_text(html)
    JS.write_text(js)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC AUTH NAV FIX V22 INSTALLED")
print("Backups:")
print(" ",html_bak)
print(" ",js_bak)
print("Behavior:")
print("  Back arrow -> /sync.html")
print("  Successful authorize/revoke -> automatic redirect to /sync.html")
print("  Browser history and window.close() are no longer required.")
