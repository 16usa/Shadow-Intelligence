#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
HTML=ROOT/"public/execution-authorize.html"
JS=ROOT/"public/execution-authorize.js"
MARK="SYNC_AUTH_CONTINUE_V23"

for p in (HTML,JS):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

html=HTML.read_text()
js=JS.read_text()

if MARK in html and MARK in js:
    print("SYNC AUTH CONTINUE V23 ALREADY INSTALLED")
    raise SystemExit(0)

html_bak=ROOT/"public/execution-authorize.html.bak-auth-continue-v23"
js_bak=ROOT/"public/execution-authorize.js.bak-auth-continue-v23"
shutil.copy2(HTML,html_bak)
shutil.copy2(JS,js_bak)

def fail(msg):
    shutil.copy2(html_bak,HTML)
    shutil.copy2(js_bak,JS)
    raise SystemExit("ERROR: "+msg+". Originals restored.")

try:
    # Always make the visible back arrow deterministic.
    html=html.replace('href="javascript:history.back()"','href="/sync.html"',1)

    # Add styling for the post-authorization CTA.
    if ".btn.copy-trading" not in html:
        css_anchor=".btn.secondary{background:#18181b;color:#eee;border:1px solid #2b2b30}"
        if css_anchor not in html:
            fail("button CSS anchor not found")
        html=html.replace(
            css_anchor,
            css_anchor+".btn.copy-trading{background:#19e77d;color:#050505}",
            1
        )

    # Add the CTA after the existing authorization action button.
    if 'id="copyTradingBtn"' not in html:
        action_anchor='<button class="btn" id="actionBtn" disabled>Continue in wallet</button>'
        if action_anchor not in html:
            fail("action button anchor not found")
        html=html.replace(
            action_anchor,
            action_anchor+'<button class="btn copy-trading" id="copyTradingBtn" hidden>GO TO COPY TRADING</button><!-- '+MARK+' -->',
            1
        )
    elif MARK not in html:
        html=html.replace('id="copyTradingBtn"','id="copyTradingBtn" data-sync-v23="1"',1)

    # Add helper after status() definition.
    if "function showCopyTradingCta()" not in js:
        status_anchor="const status=t=>{$('#status').textContent=t};"
        if status_anchor not in js:
            fail("status helper anchor not found")
        helper=r"""const status=t=>{$('#status').textContent=t};
  function showCopyTradingCta(){
    const action=$('#actionBtn');
    const button=$('#copyTradingBtn');
    if(action)action.hidden=true;
    if(button){
      button.hidden=false;
      button.disabled=false;
    }
    try{sessionStorage.setItem('sync24_authorized','1')}catch{}
  } // SYNC_AUTH_CONTINUE_V23
"""
        js=js.replace(status_anchor,helper,1)

    # Ensure load() keeps the CTA visible if the user stays/reloads after authorization.
    old_load="async function load(){try{render(await api(`/api/copy-engine/authorization?token=${encodeURIComponent(token)}&action=${mode}`));status('Ready. This is an on-chain policy transaction, not a transfer to Shadow.')}catch(e){status(e.message);$('#actionBtn').disabled=true}}"
    if old_load in js:
        new_load=r"""async function load(){
    try{
      render(await api(`/api/copy-engine/authorization?token=${encodeURIComponent(token)}&action=${mode}`));
      status('Ready. This is an on-chain policy transaction, not a transfer to SYNC.');
      if(mode==='authorize'){
        try{if(sessionStorage.getItem('sync24_authorized')==='1')showCopyTradingCta()}catch{}
      }
    }catch(e){
      if(mode==='authorize'){
        try{
          if(sessionStorage.getItem('sync24_authorized')==='1'){
            status('SYNC 24/7 execution is authorized.');
            $('#status').className='status good';
            showCopyTradingCta();
            return;
          }
        }catch{}
      }
      status(e.message);
      $('#actionBtn').disabled=true;
    }
  }"""
        js=js.replace(old_load,new_load,1)

    # Replace the post-confirm success behavior.
    # Handles both the old window.close() version and V22 location.replace() version.
    old_close="$('#status').className='status good';setTimeout(()=>{try{window.close()}catch{}},1200);return result"
    old_redirect="$('#status').className='status good';/* SYNC_AUTH_NAV_FIX_V22 */setTimeout(()=>{location.replace('/sync.html')},900);return result"

    replacement=r"""$('#status').className='status good';
      if(mode==='authorize'){
        showCopyTradingCta();
      }else{
        setTimeout(()=>{location.replace('/sync.html')},900);
      }
      return result"""

    if old_redirect in js:
        js=js.replace(old_redirect,replacement,1)
    elif old_close in js:
        js=js.replace(old_close,replacement,1)
    elif "showCopyTradingCta();" not in js.split("async function sign()",1)[-1]:
        fail("post-authorization success anchor not found")

    # Wire the new button once.
    bind_anchor="$('#actionBtn').addEventListener('click',sign);$('#refreshBtn').addEventListener('click',load);"
    if "$('#copyTradingBtn').addEventListener" not in js:
        if bind_anchor not in js:
            fail("button binding anchor not found")
        js=js.replace(
            bind_anchor,
            "$('#actionBtn').addEventListener('click',sign);$('#refreshBtn').addEventListener('click',load);$('#copyTradingBtn').addEventListener('click',()=>{location.href='/sync.html'});",
            1
        )

    # Keep old Shadow-facing copy text synchronized with current SYNC branding where safe.
    js=js.replace("not a transfer to Shadow","not a transfer to SYNC")
    js=js.replace("Shadow still cannot exceed the signed policy.","SYNC still cannot exceed the signed policy.")

    HTML.write_text(html)
    JS.write_text(js)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC AUTH CONTINUE V23 INSTALLED")
print("Backups:")
print(" ",html_bak)
print(" ",js_bak)
print("Behavior:")
print("  Back arrow -> /sync.html")
print("  Before authorization -> normal SIGN button")
print("  After successful authorization -> SIGN button hides")
print("  GO TO COPY TRADING appears")
print("  User taps it -> /sync.html")
print("  No forced redirect after authorization")
