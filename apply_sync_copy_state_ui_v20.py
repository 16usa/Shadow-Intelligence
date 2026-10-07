#!/usr/bin/env python3
from pathlib import Path
import shutil, re

ROOT=Path.cwd()
SYNC=ROOT/"public/sync.js"
MARK="SYNC_COPY_STATE_UI_V20"

if not SYNC.is_file():
    raise SystemExit("ERROR: public/sync.js not found. Run from ~/workspace.")

text=SYNC.read_text()

if MARK in text:
    print("SYNC COPY STATE UI V20 ALREADY INSTALLED")
    raise SystemExit(0)

backup=ROOT/"public/sync.js.bak-copy-state-v20"
shutil.copy2(SYNC,backup)

pattern=re.compile(
    r"  function renderCopyState\(\)\{.*?\n  \}\n\n  async function loadRoom\(\)\{",
    re.S
)
m=pattern.search(text)
if not m:
    raise SystemExit("ERROR: renderCopyState block not found. No files changed.")

replacement=r'''  /* SYNC_COPY_STATE_UI_V20 */
  function executionAuthorizationState(){
    var execution=state.execution||{};
    return String(
      execution.executionWallet&&execution.executionWallet.authorizationState||
      execution.engine&&execution.engine.authorizationState||
      state.copy&&state.copy.engineState||
      ""
    ).trim().toLowerCase();
  }

  function executionIsAuthorized(){
    var auth=executionAuthorizationState();
    var execution=state.execution||{};
    return !!(
      state.copy&&state.copy.enabled&&state.copy.engineState==="active"||
      execution.engine&&execution.engine.active===true||
      auth==="authorized"||
      auth==="active"||
      auth==="ready"
    );
  }

  function renderCopyState(){
    var sub=state.copy;
    var engineState=String(sub&&sub.engineState||"").toLowerCase();
    var active=!!(sub&&sub.enabled&&engineState==="active");
    var authorized=executionIsAuthorized();
    var needsAuthorization=!!(
      !active &&
      state.authorizationUrl &&
      !authorized
    );
    var activating=!!(
      sub &&
      !active &&
      !needsAuthorization &&
      engineState &&
      engineState!=="stopped" &&
      engineState!=="draft" &&
      engineState!=="authorization_required" &&
      engineState!=="execution_wallet_required"
    );
    var ready=!!(
      state.wallet &&
      !active &&
      !needsAuthorization &&
      !activating
    );

    var badge=qs("#copyBadge");
    badge.classList.toggle("is-active",active);
    badge.classList.toggle("is-pending",needsAuthorization||activating);

    if(active){
      badge.textContent="ACTIVE";
      qs("#copyStateTitle").textContent="Copy trading active";
    }else if(needsAuthorization){
      badge.textContent="AUTHORIZE";
      qs("#copyStateTitle").textContent="Execution authorization required";
    }else if(activating){
      badge.textContent="PENDING";
      qs("#copyStateTitle").textContent="Activating copy trading";
    }else if(ready){
      badge.textContent="READY";
      qs("#copyStateTitle").textContent="Ready to start copying";
    }else{
      badge.textContent="OFF";
      qs("#copyStateTitle").textContent="Connect wallet to continue";
    }

    var start=qs("#startButton");
    var stop=qs("#stopButton");
    var authBox=qs("#authorizationBox");
    var authButton=qs("#authorizeButton");

    // AUTHORIZE -> READY -> START COPYING -> ACTIVE.
    if(start){
      start.hidden=false;
      start.disabled=needsAuthorization||activating||!state.wallet;
      start.textContent=active?"UPDATE SETTINGS":
        needsAuthorization?"AUTHORIZE FIRST":
        activating?"ACTIVATING…":
        "START COPYING";
    }

    // STOP COPYING only makes sense when copy trading is ACTIVE.
    if(stop){
      stop.hidden=!active;
      stop.disabled=!active;
    }

    if(authBox)authBox.hidden=!needsAuthorization;
    if(authButton){
      authButton.hidden=!needsAuthorization;
      authButton.disabled=!needsAuthorization||!state.authorizationUrl;
      authButton.textContent="AUTHORIZE";
    }
  }
  /* SYNC_COPY_STATE_UI_V20_END */

  async function loadRoom(){'''

patched=text[:m.start()]+replacement+text[m.end():]

boot_pat=re.compile(
    r"  async function boot\(\)\{\s*bind\(\);\s*await loadRoom\(\);\s*await loadSession\(\);(?P<body>.*?)\n  \}",
    re.S
)
bm=boot_pat.search(patched)
if bm:
    body=bm.group("body")
    if "SYNC_COPY_STATE_UI_V20_REFRESH" not in body:
        extra=r'''
    /* SYNC_COPY_STATE_UI_V20_REFRESH */
    window.addEventListener("pageshow",function(){
      if(state.wallet&&roomReady())loadCopyState().catch(function(){});
    });
    document.addEventListener("visibilitychange",function(){
      if(document.visibilityState==="visible"&&state.wallet&&roomReady()){
        loadCopyState().catch(function(){});
      }
    });
    setInterval(function(){
      var sub=state.copy;
      if(!state.wallet||!roomReady())return;
      if(sub&&sub.enabled&&sub.engineState==="active")return;
      loadCopyState().catch(function(){});
    },4000);
    /* SYNC_COPY_STATE_UI_V20_REFRESH_END */'''
        patched=patched[:bm.start("body")]+body+extra+patched[bm.end("body"):]

SYNC.write_text(patched)

print("SYNC COPY STATE UI V20 INSTALLED")
print("Backup:",backup)
print("State flow:")
print("  AUTHORIZE -> READY -> START COPYING -> ACTIVE")
print("STOP COPYING is visible only while ACTIVE.")
print("Authorization state auto-refreshes after returning to the page.")
