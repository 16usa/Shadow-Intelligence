#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
HTML=ROOT/"public/sync.html"
JS=ROOT/"public/sync.js"
CSS=ROOT/"public/sync-vault-header.css"
MARK="SYNC_VAULT_HEADER_LIVE_V24"

for p in (HTML,JS):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

html=HTML.read_text()
js=JS.read_text()

if MARK in html and MARK in js and CSS.exists():
    print("SYNC VAULT HEADER LIVE V24 ALREADY INSTALLED")
    raise SystemExit(0)

html_bak=ROOT/"public/sync.html.bak-vault-header-v24"
js_bak=ROOT/"public/sync.js.bak-vault-header-v24"
shutil.copy2(HTML,html_bak)
shutil.copy2(JS,js_bak)

def fail(msg):
    shutil.copy2(html_bak,HTML)
    shutil.copy2(js_bak,JS)
    raise SystemExit("ERROR: "+msg+". Original sync.html/sync.js restored.")

try:
    if "sync-vault-header.css" not in html:
        anchor='<link rel="stylesheet" href="/sync-pepe-fix-v2.css?v=2">'
        if anchor not in html:
            fail("CSS link anchor not found")
        html=html.replace(
            anchor,
            anchor+'\n  <link rel="stylesheet" href="/sync-vault-header.css?v=24">',
            1
        )

    if 'id="vaultHeaderBalance"' not in html:
        menu_start='    <details class="sync-menu">'
        menu_end='    </details>\n</header>'
        if menu_start not in html or menu_end not in html:
            fail("topbar menu anchor not found")
        html=html.replace(
            menu_start,
            '    <div class="topbar-right"><!-- '+MARK+' -->\n'
            '      <div id="vaultHeaderBalance" class="vault-header-balance" hidden title="Current delegated vault balance">'
            '<span id="vaultHeaderAmount">0</span><small>SOL</small></div>\n'
            + menu_start,
            1
        )
        html=html.replace(
            menu_end,
            '    </details>\n    </div>\n</header>',
            1
        )
    elif MARK not in html:
        html=html.replace(
            'id="vaultHeaderBalance"',
            'id="vaultHeaderBalance" data-sync-v24="1"',
            1
        )

    state_anchor='    pushActive:false\n  };'
    if 'vaultHeaderBusy' not in js:
        if state_anchor not in js:
            fail("state anchor not found")
        js=js.replace(
            state_anchor,
            '    pushActive:false,\n'
            '    vaultHeaderBusy:false,\n'
            '    vaultHeaderLast:null\n'
            '  };',
            1
        )

    if 'async function loadVaultHeaderBalance()' not in js:
        helper_anchor='  function roomReady(){'
        if helper_anchor not in js:
            fail("roomReady anchor not found")
        helpers = '''  /* SYNC_VAULT_HEADER_LIVE_V24 */
  function formatVaultHeaderSol(value){
    var n=Number(value||0);
    if(!isFinite(n)||n<=0)return "0";
    if(n<0.001)return n.toFixed(6).replace(/0+$/,"").replace(/\\.$/,"");
    if(n<1)return n.toFixed(4).replace(/0+$/,"").replace(/\\.$/,"");
    if(n<100)return n.toFixed(3).replace(/0+$/,"").replace(/\\.$/,"");
    return n.toFixed(2).replace(/0+$/,"").replace(/\\.$/,"");
  }

  function renderVaultHeaderBalance(value,visible){
    var box=qs("#vaultHeaderBalance");
    var amount=qs("#vaultHeaderAmount");
    if(!box||!amount)return;
    if(!visible){
      box.hidden=true;
      return;
    }
    var n=Math.max(0,Number(value||0));
    amount.textContent=formatVaultHeaderSol(n);
    box.classList.toggle("is-zero",n<=0);
    box.hidden=false;
  }

  async function loadVaultHeaderBalance(){
    if(state.vaultHeaderBusy)return;
    if(document.visibilityState==="hidden")return;
    if(!state.user||!state.wallet||!roomReady()){
      state.vaultHeaderLast=null;
      renderVaultHeaderBalance(0,false);
      return;
    }

    state.vaultHeaderBusy=true;
    try{
      var data=await api(
        "/api/entities/"+encodeURIComponent(state.room.leader.id)+"/copy/reclaim",
        {method:"GET"}
      );
      var assets=Array.isArray(data&&data.assets)?data.assets:[];
      var total=0;
      assets.forEach(function(asset){
        if(asset&&asset.isWsol){
          var n=Number(asset.uiAmount||0);
          if(isFinite(n)&&n>0)total+=n;
        }
      });
      state.vaultHeaderLast=total;
      renderVaultHeaderBalance(total,true);
    }catch(error){
      if(state.vaultHeaderLast!=null){
        renderVaultHeaderBalance(state.vaultHeaderLast,true);
      }else{
        renderVaultHeaderBalance(0,false);
      }
    }finally{
      state.vaultHeaderBusy=false;
    }
  }
  /* SYNC_VAULT_HEADER_LIVE_V24_END */

'''
        js=js.replace(helper_anchor,helpers+helper_anchor,1)

    if 'setInterval(loadVaultHeaderBalance,1000)' not in js:
        old_boot='''  async function boot(){
    bind();
    await loadRoom();
    await loadSession();
    setInterval(loadRoom,5000);
  }'''
        if old_boot not in js:
            fail("boot block not found")
        new_boot='''  async function boot(){
    bind();
    await loadRoom();
    await loadSession();
    await loadVaultHeaderBalance();

    setInterval(loadRoom,5000);

    setInterval(loadVaultHeaderBalance,1000);
    window.addEventListener("pageshow",function(){
      loadVaultHeaderBalance();
    });
    document.addEventListener("visibilitychange",function(){
      if(document.visibilityState==="visible")loadVaultHeaderBalance();
    });
  }'''
        js=js.replace(old_boot,new_boot,1)

    HTML.write_text(html)
    JS.write_text(js)
    CSS.write_text((ROOT/"sync-v24-payload.css").read_text())

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC VAULT HEADER LIVE V24 INSTALLED")
print("Backups:")
print(" ",html_bak)
print(" ",js_bak)
print("Behavior:")
print("  Right side of SYNC header shows current delegated vault WSOL amount.")
print("  Value refreshes from on-chain reclaim status every ~1 second while page is visible.")
print("  It refreshes immediately on page return / visibility restore.")
print("  No trading, policy, TP/SL, copy sizing, or withdrawal logic changed.")
