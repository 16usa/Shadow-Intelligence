#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

if [[ ! -f "$PROJECT_DIR/server.mjs" || ! -d "$PROJECT_DIR/public" ]]; then
  echo "ERROR: Run this installer from the Shadow-Intelligence repository root."
  exit 1
fi

cd "$PROJECT_DIR"

BACKUP=".shadow-public-copy-room-v1-backup-server.mjs"
if [[ ! -f "$BACKUP" ]]; then
  cp server.mjs "$BACKUP"
fi

python3 - <<'PY'
from pathlib import Path

path=Path("server.mjs")
source=path.read_text()

tag="SHADOW_PUBLIC_COPY_ROOM_V100"
settings_marker="  if (route === '/api/settings' && method === 'GET') {"
static_old="  let rel = url.pathname === '/' ? '/index.html' : url.pathname;"
static_new="  let rel = url.pathname === '/' ? '/index.html' : (url.pathname === '/sync' ? '/sync.html' : url.pathname);"

api_block=r"""  /* SHADOW_PUBLIC_COPY_ROOM_V100 */
  if (route === '/api/public-copy-room/status' && method === 'GET') {
    const roomEnabled=getSetting(db,'public_copy_room_enabled','true')!=='false';
    const configuredLeaderId=clean(
      getSetting(db,'public_copy_leader_entity_id',process.env.PUBLIC_COPY_LEADER_ENTITY_ID||''),
      120
    );
    const leader=configuredLeaderId
      ? db.prepare("SELECT id,name,x_handle AS xHandle,avatar,status FROM entities WHERE id=?").get(configuredLeaderId)
      : null;
    const mainWallet=leader?mainCopyWalletRows(db,leader.id)[0]||null:null;
    const copyTradingEnabled=getSetting(db,'copy_trading_enabled','true')==='true';

    if(!roomEnabled || !leader || !mainWallet){
      return json(res,200,{
        configured:false,
        enabled:roomEnabled,
        copyTradingEnabled,
        engineConfigured:shadowCopyEngineConfigured(),
        leader:null,
        counts:{connected:0,active:0,pending:0},
        recent:[],
        solUsd:await currentSolUsd()
      });
    }

    const counts=db.prepare(
      "SELECT COUNT(DISTINCT user_id) AS connected, "+
      "COUNT(DISTINCT CASE WHEN enabled=1 AND engine_state='active' THEN user_id END) AS active, "+
      "COUNT(DISTINCT CASE WHEN engine_state NOT IN ('active','stopped') THEN user_id END) AS pending "+
      "FROM copy_subscriptions WHERE entity_id=?"
    ).get(leader.id)||{};

    const recent=db.prepare(
      "SELECT a.id,a.type,a.signature,a.mint AS tokenMint,"+
      "ABS(COALESCE(a.trade_usd,0)) AS tradeUsd,"+
      "ABS(COALESCE(a.sol_amount,0)) AS solAmount,"+
      "COALESCE(NULLIF(a.block_time,''),a.created_at) AS eventAt,"+
      "COALESCE(t.symbol,a.token_symbol,'') AS symbol,"+
      "COALESCE(t.name,a.token_name,'') AS tokenName,"+
      "COALESCE(t.image,'') AS tokenImage,"+
      "COALESCE(t.market_cap,0) AS marketCap "+
      "FROM wallet_activity a LEFT JOIN tokens t ON t.mint=a.mint "+
      "WHERE a.entity_id=? AND a.wallet_id=? AND a.type IN ('buy','sell','swap') "+
      "ORDER BY COALESCE(NULLIF(a.block_time,''),a.created_at) DESC LIMIT 12"
    ).all(leader.id,mainWallet.id).map(row=>({
      ...row,
      side:String(row.type||'').toLowerCase()==='sell'?'sell':'buy'
    }));

    return json(res,200,{
      configured:true,
      enabled:true,
      copyTradingEnabled,
      engineConfigured:shadowCopyEngineConfigured(),
      leader:{
        id:leader.id,
        name:leader.name||'Leader',
        xHandle:leader.xHandle||'',
        avatar:leader.avatar||'',
        status:leader.status||'',
        mainWallet:{address:mainWallet.address,label:mainWallet.label||'Main Wallet'}
      },
      counts:{
        connected:Number(counts.connected||0),
        active:Number(counts.active||0),
        pending:Number(counts.pending||0)
      },
      recent,
      solUsd:await currentSolUsd()
    });
  }

  if (route === '/api/public-copy-room/config' && method === 'GET') {
    const owner=requireOwner(req,res,db); if(!owner)return;
    const entityRowsForRoom=db.prepare(
      "SELECT e.id,e.name,e.x_handle AS xHandle,e.avatar,"+
      "(SELECT w.address FROM wallets w WHERE w.entity_id=e.id ORDER BY "+
      "CASE WHEN lower(trim(COALESCE(w.label,'')))='main wallet' THEN 0 ELSE 1 END,w.created_at ASC LIMIT 1) AS mainWalletAddress "+
      "FROM entities e ORDER BY e.created_at DESC LIMIT 250"
    ).all();
    return json(res,200,{
      enabled:getSetting(db,'public_copy_room_enabled','true')!=='false',
      leaderEntityId:getSetting(db,'public_copy_leader_entity_id',process.env.PUBLIC_COPY_LEADER_ENTITY_ID||''),
      entities:entityRowsForRoom
    });
  }

  if (route === '/api/public-copy-room/config' && method === 'PUT') {
    const owner=requireOwner(req,res,db); if(!owner)return;
    const body=await readJson(req);
    const entityId=clean(body.entityId,120);
    if(entityId && !db.prepare('SELECT 1 FROM entities WHERE id=?').get(entityId)){
      return json(res,404,{error:'Leader entity not found'});
    }
    const stmt=db.prepare(
      'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    );
    stmt.run('public_copy_leader_entity_id',entityId);
    stmt.run('public_copy_room_enabled',body.enabled===false?'false':'true');
    return json(res,200,{
      ok:true,
      enabled:body.enabled!==false,
      leaderEntityId:entityId
    });
  }
  /* SHADOW_PUBLIC_COPY_ROOM_V100_END */

"""

if tag not in source:
    if settings_marker not in source:
        raise SystemExit("ERROR: server.mjs settings route marker was not found; patch not applied.")
    source=source.replace(settings_marker,api_block+settings_marker,1)

if "/sync.html" not in source:
    if static_old not in source:
        raise SystemExit("ERROR: static route marker was not found; patch not applied.")
    source=source.replace(static_old,static_new,1)

path.write_text(source)
print("server.mjs patched")
PY

cp "$PATCH_DIR/public/sync.html" public/sync.html
cp "$PATCH_DIR/public/sync.css" public/sync.css
cp "$PATCH_DIR/public/sync.js" public/sync.js

node --check server.mjs
node --check public/sync.js

echo
echo "SHADOW PUBLIC COPY ROOM v1 installed."
echo "Open: /sync"
echo "No restart was performed."
echo "Restart manually when you are ready: Stop -> Run"
