#!/usr/bin/env python3
from pathlib import Path
import shutil, re

ROOT = Path.cwd()
SYNC = ROOT / "public/sync.js"
MARK = "SYNC_COPY_STATE_UI_V20B"

if not SYNC.is_file():
    raise SystemExit("ERROR: public/sync.js not found. Run this from ~/workspace.")

text = SYNC.read_text()

if MARK in text:
    print("SYNC COPY STATE UI V20B ALREADY INSTALLED")
    raise SystemExit(0)

backup = ROOT / "public/sync.js.bak-copy-state-v20b"
shutil.copy2(SYNC, backup)

def find_function_block(src, name):
    m = re.search(r"\bfunction\s+" + re.escape(name) + r"\s*\([^)]*\)\s*\{", src)
    if not m:
        raise RuntimeError(f"{name}() not found")
    open_brace = src.find("{", m.start())
    i = open_brace
    depth = 0
    quote = None
    esc = False
    line_comment = False
    block_comment = False
    while i < len(src):
        ch = src[i]
        nxt = src[i+1] if i + 1 < len(src) else ""

        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue

        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
                continue
            i += 1
            continue

        if quote:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == quote:
                quote = None
            i += 1
            continue

        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            i += 1
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return m.start(), i + 1
        i += 1

    raise RuntimeError(f"{name}() closing brace not found")

try:
    start, end = find_function_block(text, "renderCopyState")

    replacement = r'''/* SYNC_COPY_STATE_UI_V20B */
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
      engineState!=="execution_wallet_required" &&
      engineState!=="error"
    );

    var ready=!!(
      state.wallet &&
      !active &&
      !needsAuthorization &&
      !activating
    );

    var badge=qs("#copyBadge");
    if(badge){
      badge.classList.toggle("is-active",active);
      badge.classList.toggle("is-pending",needsAuthorization||activating);

      if(active)badge.textContent="ACTIVE";
      else if(needsAuthorization)badge.textContent="AUTHORIZE";
      else if(activating)badge.textContent="PENDING";
      else if(ready)badge.textContent="READY";
      else badge.textContent="OFF";
    }

    var title=qs("#copyStateTitle");
    if(title){
      if(active)title.textContent="Copy trading active";
      else if(needsAuthorization)title.textContent="Execution authorization required";
      else if(activating)title.textContent="Activating copy trading";
      else if(ready)title.textContent="Ready to start copying";
      else title.textContent="Connect wallet to continue";
    }

    var startButton=qs("#startButton");
    var stopButton=qs("#stopButton");
    var authorizationBox=qs("#authorizationBox");
    var authorizeButton=qs("#authorizeButton");

    if(startButton){
      startButton.hidden=false;
      startButton.disabled=needsAuthorization||activating||!state.wallet;
      startButton.textContent=active
        ?"UPDATE SETTINGS"
        :needsAuthorization
          ?"AUTHORIZE FIRST"
          :activating
            ?"ACTIVATING…"
            :"START COPYING";
    }

    // STOP COPYING exists only for a genuinely ACTIVE subscription.
    if(stopButton){
      stopButton.hidden=!active;
      stopButton.disabled=!active;
    }

    if(authorizationBox)authorizationBox.hidden=!needsAuthorization;

    if(authorizeButton){
      authorizeButton.hidden=!needsAuthorization;
      authorizeButton.disabled=!needsAuthorization||!state.authorizationUrl;
      authorizeButton.textContent="AUTHORIZE";
    }
  }
  /* SYNC_COPY_STATE_UI_V20B_END */'''

    text = text[:start] + replacement + text[end:]

    # Add resilient auto-refresh before the final boot() call.
    boot_pos = text.rfind("boot();")
    if boot_pos < 0:
        raise RuntimeError("boot(); call not found")

    refresh = r'''
  /* SYNC_COPY_STATE_UI_V20B_REFRESH */
  window.addEventListener("pageshow",function(){
    if(state.wallet&&roomReady()){
      loadCopyState().catch(function(){});
    }
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
  /* SYNC_COPY_STATE_UI_V20B_REFRESH_END */

'''
    text = text[:boot_pos] + refresh + text[boot_pos:]

    SYNC.write_text(text)

except Exception as e:
    shutil.copy2(backup, SYNC)
    raise SystemExit(f"ERROR: {e}. Original public/sync.js restored.")

print("SYNC COPY STATE UI V20B INSTALLED")
print("Backup:", backup)
print("State flow: AUTHORIZE -> READY -> START COPYING -> ACTIVE")
print("STOP COPYING is hidden unless the subscription is actually ACTIVE.")
print("Authorization state refreshes automatically after returning to the page.")
