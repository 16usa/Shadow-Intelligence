#!/usr/bin/env python3
from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

def read(rel):
    p = root / rel
    if not p.exists():
        raise SystemExit(f"Missing required file: {rel}")
    return p.read_text(encoding="utf-8")

def write(rel, text):
    (root / rel).write_text(text, encoding="utf-8")

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Patch failed: could not find {label}. The project version may have changed.")
    return text.replace(old, new, 1)

# ---- src/db.mjs ----
db = read("src/db.mjs")
if "SHADOW_PROFILE_SOURCE_V270_DB" not in db:
    db = replace_once(
        db,
        "id TEXT PRIMARY KEY,name TEXT NOT NULL,x_handle TEXT DEFAULT '',avatar TEXT DEFAULT '',avatar_source TEXT DEFAULT 'manual',",
        "id TEXT PRIMARY KEY,name TEXT NOT NULL,x_handle TEXT DEFAULT '',profile_platform TEXT DEFAULT 'auto',profile_handle TEXT DEFAULT '',profile_url TEXT DEFAULT '',avatar TEXT DEFAULT '',avatar_source TEXT DEFAULT 'manual',",
        "entities base schema",
    )
    anchor = "  addColumn(db,'entities',\"x_last_synced_at TEXT DEFAULT ''\");"
    db = replace_once(
        db,
        anchor,
        anchor + """
  /* SHADOW_PROFILE_SOURCE_V270_DB */
  addColumn(db,'entities',"profile_platform TEXT DEFAULT 'auto'");
  addColumn(db,'entities',"profile_handle TEXT DEFAULT ''");
  addColumn(db,'entities',"profile_url TEXT DEFAULT ''");
  /* SHADOW_PROFILE_SOURCE_V270_DB_END */""",
        "entity migration anchor",
    )
    write("src/db.mjs", db)

# ---- server.mjs ----
server = read("server.mjs")

if "profile-avatar.mjs" not in server:
    server = replace_once(
        server,
        "import { resolveWalletAvatar } from './src/adapters/pump-profile.mjs';",
        "import { resolveWalletAvatar } from './src/adapters/pump-profile.mjs';\nimport { resolveProfileAvatar, normalizeProfilePlatform, normalizeProfileHandle, isPublicProfileUrl } from './src/adapters/profile-avatar.mjs';",
        "profile adapter import",
    )

if "profileHandle:e.profile_handle" not in server:
    server = replace_once(
        server,
        "      xHandle:e.x_handle,\n      walletCount:e.walletCount,",
        "      xHandle:e.x_handle,\n      profileHandle:e.profile_handle,\n      profilePlatform:e.profile_platform,\n      profileUrl:e.profile_url,\n      walletCount:e.walletCount,",
        "entity row mapping",
    )

if "SHADOW_WALLET_DUPLICATE_CHECK_V270" not in server:
    wallet_check = r"""  /* SHADOW_WALLET_DUPLICATE_CHECK_V270 */
  if (route === '/api/wallets/check' && method === 'GET') {
    if (!requireOwner(req,res,db)) return;
    const address=clean(url.searchParams.get('address'),120);
    if(!address)return json(res,200,{valid:false,exists:false,error:'Wallet address required'});
    if(!isSolanaAddress(address))return json(res,200,{valid:false,exists:false,error:'Invalid Solana wallet address'});

    const row=db.prepare(`
      SELECT
        w.id AS walletId,w.address,w.label,
        e.id AS entityId,e.name,e.x_handle AS xHandle,
        e.profile_handle AS profileHandle,e.profile_platform AS profilePlatform,
        e.profile_url AS profileUrl,e.avatar
      FROM wallets w
      LEFT JOIN entities e ON e.id=w.entity_id
      WHERE w.address=?
      LIMIT 1
    `).get(address);

    if(!row)return json(res,200,{valid:true,exists:false,address});

    return json(res,200,{
      valid:true,
      exists:true,
      address,
      wallet:{id:row.walletId,address:row.address,label:row.label||''},
      entity:row.entityId?{
        id:row.entityId,
        name:row.name||'',
        xHandle:row.xHandle||'',
        profileHandle:row.profileHandle||'',
        profilePlatform:row.profilePlatform||'auto',
        profileUrl:row.profileUrl||'',
        avatar:row.avatar||''
      }:null
    });
  }
  /* SHADOW_WALLET_DUPLICATE_CHECK_V270_END */

"""
    marker = "  /* SHADOW_ENTITIES_CARD_INFO_V2417_SERVER */"
    server = replace_once(server, marker, wallet_check + marker, "wallet check insertion point")

if "SHADOW_PROFILE_SOURCE_V270_CREATE" not in server:
    pattern = re.compile(
        r"  if \(route === '/api/entities' && method === 'POST'\) \{.*?\n  \}\n  /\* SHADOW_ADMIN_ENTITY_V213_START \*/",
        re.S,
    )
    match = pattern.search(server)
    if not match:
        raise SystemExit("Patch failed: could not find entity create route.")

    create_block = r"""  /* SHADOW_PROFILE_SOURCE_V270_CREATE */
  if (route === '/api/entities' && method === 'POST') {
    if (!requireOwner(req,res,db)) return;

    const b=await readJson(req);
    const profilePlatform=normalizeProfilePlatform(b.profilePlatform||b.platform||'auto');
    const profileHandle=normalizeProfileHandle(b.profileHandle||b.handle||'');
    let profileUrl=clean(b.profileUrl,1000);
    const name=clean(b.name,80)||(profileHandle?`@${profileHandle}`:'');
    if(!name)return json(res,400,{error:'Name or username required'});

    if(profileUrl&&!isPublicProfileUrl(profileUrl)){
      return json(res,400,{error:'Profile URL must be a public HTTPS URL'});
    }

    const wallet=clean(b.wallet,120);
    if(wallet&&!isSolanaAddress(wallet)){
      return json(res,400,{error:'Invalid Solana wallet address'});
    }

    const duplicateWallet=wallet?db.prepare(`
      SELECT w.id AS walletId,e.id AS entityId,e.name,e.x_handle AS xHandle,
             e.profile_handle AS profileHandle,e.profile_platform AS profilePlatform,e.avatar
      FROM wallets w LEFT JOIN entities e ON e.id=w.entity_id
      WHERE w.address=? LIMIT 1
    `).get(wallet):null;

    if(duplicateWallet){
      return json(res,409,{
        error:'Wallet already tracked',
        code:'wallet_exists',
        entity:duplicateWallet.entityId?{
          id:duplicateWallet.entityId,
          name:duplicateWallet.name||'',
          xHandle:duplicateWallet.xHandle||'',
          profileHandle:duplicateWallet.profileHandle||'',
          profilePlatform:duplicateWallet.profilePlatform||'auto',
          avatar:duplicateWallet.avatar||''
        }:null
      });
    }

    let xHandle=clean(b.xHandle,50);
    if(!xHandle&&profilePlatform==='x'&&profileHandle)xHandle=`@${profileHandle}`;

    let avatar=String(b.avatar||'').trim();
    if(avatar&&!(avatar.startsWith('data:image/')||isSafeHttpUrl(avatar))){
      return json(res,400,{error:'Avatar must be an image upload or safe URL'});
    }
    if(avatar.length>1_400_000)return json(res,413,{error:'Avatar is too large'});

    let avatarSource=avatar?'manual':'pending';

    if(!avatar&&(profileHandle||profileUrl)){
      const resolved=await resolveProfileAvatar({
        platform:profilePlatform,
        handle:profileHandle,
        profileUrl
      });
      if(!profileUrl&&resolved.profileUrl)profileUrl=clean(resolved.profileUrl,1000);
      if(resolved.avatar){
        avatar=resolved.avatar;
        avatarSource=resolved.source||'profile';
      }
    }

    if(!avatar&&wallet){
      const resolved=await resolveWalletAvatar(wallet);
      avatar=resolved.avatar||'';
      avatarSource=resolved.source||'generated';
    }

    const entityId=id('ent_');
    let walletId='';

    db.exec('BEGIN IMMEDIATE');
    try{
      if(wallet&&db.prepare('SELECT 1 FROM wallets WHERE address=?').get(wallet)){
        db.exec('ROLLBACK');
        return json(res,409,{error:'Wallet already tracked',code:'wallet_exists'});
      }

      db.prepare(`
        INSERT INTO entities
          (id,name,x_handle,profile_platform,profile_handle,profile_url,avatar,avatar_source,
           risk_score,confidence,incidents,follower_losses,status,notes,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        entityId,
        name,
        xHandle,
        profilePlatform,
        profileHandle,
        profileUrl,
        avatar,
        avatarSource,
        Math.max(0,Math.min(100,Number.isFinite(Number(b.riskScore))?Number(b.riskScore):0)),
        Math.max(0,Math.min(100,Number.isFinite(Number(b.confidence))?Number(b.confidence):50)),
        0,
        0,
        clean(b.status,20)||'watch',
        clean(b.notes,500),
        nowIso()
      );

      if(wallet){
        walletId=id('wal_');
        db.prepare(`
          INSERT INTO wallets
            (id,entity_id,address,label,avatar,avatar_source,sync_status,monitoring_enabled,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          walletId,
          entityId,
          wallet,
          clean(b.walletLabel,80)||'Main wallet',
          avatar,
          avatarSource,
          'pending',
          1,
          nowIso()
        );
      }

      db.exec('COMMIT');
    }catch(error){
      try{db.exec('ROLLBACK')}catch{}
      throw error;
    }

    if(walletId){
      setTimeout(()=>live.syncWallet(walletId).catch(err=>console.warn('Initial wallet sync failed:',err.message)),0).unref?.();
    }

    return json(res,201,{
      id:entityId,
      walletId:walletId||null,
      avatar,
      avatarSource,
      profilePlatform,
      profileHandle,
      profileUrl
    });
  }
  /* SHADOW_PROFILE_SOURCE_V270_CREATE_END */
  /* SHADOW_ADMIN_ENTITY_V213_START */"""
    server = server[:match.start()] + create_block + server[match.end():]

write("server.mjs", server)

# ---- public/app.js ----
app = read("public/app.js")

if "SHADOW_ENTITY_UNIVERSAL_SOURCE_V270" not in app:
    pattern = re.compile(
        r"function entityModal\(\)\{.*?\n/\* SHADOW_ADMIN_ENTITY_UI_V213_START \*/",
        re.S,
    )
    match = pattern.search(app)
    if not match:
        raise SystemExit("Patch failed: could not find entityModal().")

    modal_block = r"""/* SHADOW_ENTITY_UNIVERSAL_SOURCE_V270 */
let entityWalletCheckTimer=null;

async function checkEntityWalletAvailability(form){
  const wallet=form?.elements?.wallet;
  const status=$('#entityWalletStatus');
  const submit=$('#entityCreateButton');
  if(!wallet||!status||!submit)return;

  const address=String(wallet.value||'').trim();
  form.dataset.walletDuplicate='0';

  if(!address){
    status.innerHTML='';
    submit.disabled=false;
    return;
  }

  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)){
    status.innerHTML='<span style="color:#9ca3af">Enter the complete Solana wallet address.</span>';
    submit.disabled=true;
    return;
  }

  status.innerHTML='<span style="color:#9ca3af">Checking wallet…</span>';
  submit.disabled=true;

  try{
    const result=await api(`/api/wallets/check?address=${encodeURIComponent(address)}`);
    if(String(wallet.value||'').trim()!==address)return;

    if(!result.valid){
      status.innerHTML=`<span style="color:#ff6b6b">${esc(result.error||'Invalid Solana wallet address')}</span>`;
      submit.disabled=true;
      return;
    }

    if(result.exists){
      form.dataset.walletDuplicate='1';
      const entity=result.entity||{};
      const handle=entity.profileHandle
        ? `@${String(entity.profileHandle).replace(/^@/,'')}`
        : (entity.xHandle||'');
      const source=entity.profilePlatform&&entity.profilePlatform!=='auto'
        ? entity.profilePlatform
        : '';
      const subtitle=[handle,source].filter(Boolean).join(' · ');
      status.innerHTML=`
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(255,90,90,.35);border-radius:12px;background:rgba(255,70,70,.06)">
          ${entity.avatar?`<img src="${esc(entity.avatar)}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex:0 0 auto">`:''}
          <div style="min-width:0">
            <strong style="display:block;color:#ff6b6b">Already in Shadow — cannot add again</strong>
            <span style="display:block;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(entity.name||'Existing account')}${subtitle?` · ${esc(subtitle)}`:''}</span>
          </div>
        </div>`;
      submit.disabled=true;
      return;
    }

    status.innerHTML='<span style="color:#34d399">Wallet is not in Shadow yet.</span>';
    submit.disabled=false;
  }catch(error){
    status.innerHTML=`<span style="color:#ff9f0a">${esc(error.message||'Wallet check failed')}</span>`;
    submit.disabled=false;
  }
}

function entityModal(){
  modal(`<h2>Add entity</h2>
    <form id="entityForm" class="si-modal-form" novalidate>
      <label>Name
        <input name="name" placeholder="Display name (optional if username is set)">
      </label>

      <label>Platform
        <select name="profilePlatform">
          <option value="auto">Auto</option>
          <option value="fomo">Fomo</option>
          <option value="pump.fun">Pump.fun</option>
          <option value="x">X</option>
          <option value="other">Other site</option>
        </select>
      </label>

      <label>Username / handle
        <input name="profileHandle" placeholder="@handle" autocapitalize="off" autocomplete="off">
      </label>

      <label>Profile URL
        <input name="profileUrl" placeholder="Optional — for any other site" inputmode="url" autocapitalize="off" autocomplete="off">
      </label>

      <label>X handle
        <input name="xHandle" placeholder="Optional — only for X monitoring" autocapitalize="off" autocomplete="off">
      </label>

      <label>Avatar URL
        <input name="avatar" placeholder="Optional — auto from profile / wallet" inputmode="url">
      </label>

      <label>Initial wallet
        <input name="wallet" placeholder="Solana address" autocapitalize="off" autocomplete="off" spellcheck="false">
      </label>
      <div id="entityWalletStatus" style="min-height:20px;margin-top:-6px;font-size:13px"></div>

      <label>Notes
        <textarea name="notes" rows="4"></textarea>
      </label>

      <button id="entityCreateButton" class="si-button primary" type="submit">Create entity</button>
    </form>`);

  const form=$('#entityForm');
  const wallet=form?.elements?.wallet;

  if(wallet){
    wallet.addEventListener('input',()=>{
      clearTimeout(entityWalletCheckTimer);
      entityWalletCheckTimer=setTimeout(()=>checkEntityWalletAvailability(form),350);
    });
    wallet.addEventListener('blur',()=>checkEntityWalletAvailability(form));
  }

  form.onsubmit=async event=>{
    event.preventDefault();

    if(form.dataset.walletDuplicate==='1'){
      toast('This wallet is already tracked');
      return;
    }

    const body=Object.fromEntries(new FormData(form));
    const handle=String(body.profileHandle||'').trim().replace(/^@+/,'');
    if(!String(body.name||'').trim()&&handle)body.name=`@${handle}`;

    if(!String(body.name||'').trim()){
      toast('Add a name or username');
      form.elements.name?.focus();
      return;
    }

    const submit=$('#entityCreateButton');
    submit.disabled=true;
    const previous=submit.textContent;
    submit.textContent='Creating…';

    try{
      await api('/api/entities',{method:'POST',body:JSON.stringify(body)});
      closeModal();
      toast('Entity created');
      await refresh();
      nav('entities');
    }catch(error){
      if(String(error.message||'').toLowerCase().includes('wallet already tracked')){
        form.dataset.walletDuplicate='1';
        await checkEntityWalletAvailability(form);
      }
      toast(error.message);
      submit.disabled=form.dataset.walletDuplicate==='1';
      submit.textContent=previous;
    }
  };
}
/* SHADOW_ENTITY_UNIVERSAL_SOURCE_V270_END */
/* SHADOW_ADMIN_ENTITY_UI_V213_START */"""
    app = app[:match.start()] + modal_block + app[match.end():]

write("public/app.js", app)

print("Shadow universal profile + duplicate wallet patch applied.")
