import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb, getAllSettings, getSetting } from './src/db.mjs';
import { hashPassword, verifyPassword, createSession, deleteSession, getUserFromSession, setSessionCookie, clearSessionCookie } from './src/auth.mjs';
import { clean, cleanEmail, isEmail, id, nowIso, json, parseCookies, readJson, maskWallet, isSafeHttpUrl, isSolanaAddress } from './src/utils.mjs';
import { resolveWalletAvatar } from './src/adapters/pump-profile.mjs';
import { syncCopyGroup, syncCopySubscription } from './src/adapters/copy-trading.mjs';
import { providerHealth } from './src/adapters/intelligence.mjs';
import { createLiveIntelligence } from './src/live-intelligence.mjs';
import { getTokenMarket, getTokenMetadataBatch } from './src/adapters/token-market.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

// === TOKEN PNL V13 START ===
/* SHADOW_TRADE_ONLY_V239_SERVER */
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
let solUsdCache = { value:0, at:0 };
async function currentSolUsd(){
  const now=Date.now();
  if(solUsdCache.value>0 && now-solUsdCache.at<120000) return solUsdCache.value;
  try{
    const market=await Promise.race([
      getTokenMarket(WSOL_MINT),
      new Promise(resolve=>setTimeout(()=>resolve(null),2500))
    ]);
    const price=Number(market?.priceUsd||0);
    if(Number.isFinite(price) && price>0) solUsdCache={value:price,at:now};
  }catch{}
  return solUsdCache.value||0;
}
function entityTokenPnlRows(db,entityId,limit=12,solUsd=0){
  const rows=db.prepare(`
    SELECT t.*,MAX(a.block_time) AS lastActivity,
      SUM(CASE WHEN a.type IN ('buy','swap') THEN ABS(COALESCE(a.token_amount,0)) ELSE 0 END) AS buyTokens,
      SUM(CASE WHEN a.type='sell' THEN ABS(COALESCE(a.token_amount,0)) ELSE 0 END) AS sellTokens,
      SUM(CASE WHEN a.type IN ('buy','swap') AND ABS(COALESCE(a.sol_amount,0))>0 THEN ABS(COALESCE(a.sol_amount,0)) ELSE 0 END) AS buySol,
      SUM(CASE WHEN a.type='sell' AND ABS(COALESCE(a.sol_amount,0))>0 THEN ABS(COALESCE(a.sol_amount,0)) ELSE 0 END) AS sellSol
    FROM tokens t
    JOIN wallet_activity a ON a.mint=t.mint
    WHERE a.entity_id=?
      AND a.type IN ('buy','sell','swap')
    GROUP BY t.id
    HAVING
      SUM(CASE WHEN a.type IN ('buy','swap') THEN ABS(COALESCE(a.token_amount,0)) ELSE 0 END)>1e-12
      AND (
        SUM(CASE WHEN a.type IN ('buy','swap') THEN ABS(COALESCE(a.token_amount,0)) ELSE 0 END)
        -
        SUM(CASE WHEN a.type='sell' THEN ABS(COALESCE(a.token_amount,0)) ELSE 0 END)
      )>1e-12
    ORDER BY lastActivity DESC
    LIMIT ?
  `).all(entityId,limit);
  return rows.map(row=>{
    const buyTokens=Math.abs(Number(row.buyTokens||0));
    const sellTokens=Math.abs(Number(row.sellTokens||0));
    const buySol=Math.abs(Number(row.buySol||0));
    const sellSol=Math.abs(Number(row.sellSol||0));
    const currentPriceUsd=Math.max(0,Number(row.price_usd||0));
    const matchedSold=Math.min(buyTokens,sellTokens);
    const avgBuySolPerToken=buyTokens>0?buySol/buyTokens:0;
    const matchedSellSol=sellTokens>0?sellSol*(matchedSold/sellTokens):0;
    const realizedCostSol=matchedSold*avgBuySolPerToken;
    const realizedPnlSol=matchedSellSol-realizedCostSol;
    const remainingKnown=Math.max(0,buyTokens-matchedSold);
    const basisUsd=buySol*solUsd;
    const realizedPnlUsd=realizedPnlSol*solUsd;
    const unrealizedValueUsd=remainingKnown*currentPriceUsd;
    const unrealizedCostUsd=remainingKnown*avgBuySolPerToken*solUsd;
    const unrealizedPnlUsd=unrealizedValueUsd-unrealizedCostUsd;
    const canValueOpen=remainingKnown<=1e-12 || currentPriceUsd>0;
    const pnlKnown=solUsd>0 && buySol>0 && buyTokens>0 && canValueOpen;
    const pnlUsd=pnlKnown?realizedPnlUsd+unrealizedPnlUsd:null;
    const pnlPercent=pnlKnown && basisUsd>0?(pnlUsd/basisUsd)*100:null;
    return {...row,
      pnlKnown,
      pnlUsd:pnlKnown?Number(pnlUsd.toFixed(2)):null,
      pnlPercent:pnlKnown?Number(pnlPercent.toFixed(2)):null,
      realizedPnlUsd:pnlKnown?Number(realizedPnlUsd.toFixed(2)):null,
      unrealizedPnlUsd:pnlKnown?Number(unrealizedPnlUsd.toFixed(2)):null,
      positionTokens:remainingKnown,
      costBasisUsd:pnlKnown?Number(basisUsd.toFixed(2)):null,
      solUsd:pnlKnown?Number(solUsd.toFixed(4)):null
    };
  });
}
// === TOKEN PNL V13 END ===

/* SHADOW_TOKEN_IMAGE_BACKFILL_V212_START */
async function backfillMissingTokenImages(db,{limit=5000}={}){
  if(!process.env.HELIUS_API_KEY){
    return {ok:false,skipped:true,reason:'HELIUS_API_KEY not configured'};
  }
  const rows=db.prepare(`
    SELECT id,mint,image
    FROM tokens
    WHERE COALESCE(TRIM(image),'')=''
    ORDER BY COALESCE(last_market_at,created_at) DESC
    LIMIT ?
  `).all(Math.max(1,Math.min(Number(limit)||5000,10000)));
  if(!rows.length)return {ok:true,checked:0,updated:0};
  const metadata=await getTokenMetadataBatch(rows.map(r=>r.mint));
  const update=db.prepare(`UPDATE tokens SET image=? WHERE id=? AND COALESCE(TRIM(image),'')=''`);
  let updated=0;
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const row of rows){
      const image=String(metadata.get(row.mint)?.image||'').trim();
      if(!image)continue;
      updated+=Number(update.run(image,row.id).changes||0);
    }
    db.exec('COMMIT');
  }catch(error){
    db.exec('ROLLBACK');
    throw error;
  }
  return {ok:true,checked:rows.length,updated};
}
/* SHADOW_TOKEN_IMAGE_BACKFILL_V212_END */
function userFor(req, db) {
  return getUserFromSession(db, parseCookies(req).si_session);
}
function requireUser(req, res, db) {
  const user = userFor(req, db);
  if (!user) { json(res, 401, { error: 'Authentication required' }); return null; }
  return user;
}
function requireOwner(req, res, db) {
  const user = requireUser(req, res, db);
  if (!user) return null;
  if (user.role !== 'owner' && user.role !== 'admin') { json(res, 403, { error: 'Owner access required' }); return null; }
  return user;
}
/* SHADOW_USER_COPY_TRADING_V230_SERVER_HELPERS */
const BASE58_ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(value){
  const text=String(value||'');
  if(!text)return Buffer.alloc(0);
  let bytes=[0];
  for(const ch of text){
    const digit=BASE58_ALPHABET.indexOf(ch);
    if(digit<0)throw new Error('Invalid base58');
    let carry=digit;
    for(let i=0;i<bytes.length;i++){
      const n=bytes[i]*58+carry;
      bytes[i]=n&255;
      carry=n>>8;
    }
    while(carry){
      bytes.push(carry&255);
      carry>>=8;
    }
  }
  for(let i=0;i<text.length-1&&text[i]==='1';i++)bytes.push(0);
  return Buffer.from(bytes.reverse());
}

function verifySolanaMessage(address,message,signatureBase64){
  try{
    const raw=decodeBase58(address);
    if(raw.length!==32)return false;
    const sig=Buffer.from(String(signatureBase64||''),'base64');
    if(sig.length!==64)return false;
    const der=Buffer.concat([
      Buffer.from('302a300506032b6570032100','hex'),
      raw
    ]);
    const key=crypto.createPublicKey({key:der,format:'der',type:'spki'});
    return crypto.verify(null,Buffer.from(String(message||''),'utf8'),key,sig);
  }catch{
    return false;
  }
}

function userWalletRows(db,userId){
  return db.prepare(`
    SELECT id,address,provider,verified_at AS verifiedAt,created_at AS createdAt
    FROM user_wallets
    WHERE user_id=?
    ORDER BY verified_at DESC
  `).all(userId);
}

function copySubscriptionRow(db,userId,entityId){
  const row=db.prepare(`
    SELECT s.*,uw.address AS walletAddress,uw.provider AS walletProvider,
           e.name AS entityName,e.x_handle AS xHandle
    FROM copy_subscriptions s
    JOIN user_wallets uw ON uw.id=s.user_wallet_id
    JOIN entities e ON e.id=s.entity_id
    WHERE s.user_id=? AND s.entity_id=?
  `).get(userId,entityId);
  if(!row)return null;
  return {
    ...row,
    enabled:!!row.enabled,
    copyBuys:!!row.copy_buys,
    copySells:!!row.copy_sells,
    amountSol:row.amount_sol,
    maxPositionSol:row.max_position_sol,
    maxDailySol:row.max_daily_sol,
    slippageBps:row.slippage_bps,
    sellPercent:row.sell_percent,
    engineState:row.engine_state,
    lastError:row.last_error,
    walletAddress:row.walletAddress,
    walletProvider:row.walletProvider
  };
}

function numBetween(value,min,max,fallback){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
/* SHADOW_USER_COPY_TRADING_V230_SERVER_HELPERS_END */
function entityRows(db) {
  return db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM wallets w WHERE w.entity_id=e.id) AS walletCount
    FROM entities e ORDER BY e.risk_score DESC, e.incidents DESC
  `).all().map(e => ({
    ...e, riskScore:e.risk_score, followerLosses:e.follower_losses, xHandle:e.x_handle,
    walletCount:e.walletCount, createdAt:e.created_at
  }));
}
function feedRows(db, limit = 30) {
  return db.prepare(`
    SELECT i.id,i.type,i.title,i.detail,i.severity,i.value,i.created_at AS createdAt,
      e.id AS entityId,e.name AS entityName,e.x_handle AS xHandle,e.avatar,e.risk_score AS riskScore,
      w.address AS walletAddress,t.symbol,t.name AS tokenName,t.mint AS tokenMint,t.price_change AS priceChange
    FROM incidents i
    LEFT JOIN entities e ON e.id=i.entity_id
    LEFT JOIN wallets w ON w.id=i.wallet_id
    LEFT JOIN tokens t ON t.id=i.token_id
    ORDER BY i.created_at DESC LIMIT ?
  `).all(limit).map(r => ({...r, walletAddress: r.walletAddress ? maskWallet(r.walletAddress) : ''}));
}
function groups(db) {
  return db.prepare(`
    SELECT g.id,g.name,g.mode,g.enabled,g.created_at AS createdAt,COUNT(cgw.wallet_id) AS walletCount
    FROM copy_groups g LEFT JOIN copy_group_wallets cgw ON cgw.group_id=g.id
    GROUP BY g.id ORDER BY g.created_at
  `).all().map(g => ({...g, enabled:!!g.enabled}));
}
function parseRoute(urlPath) { return urlPath.split('/').filter(Boolean); }

async function api(req, res, db, url, live) {
  const method = req.method || 'GET';
  const parts = parseRoute(url.pathname);
  const route = '/' + parts.join('/');

  if (route === '/api/health' && method === 'GET') {
    const [intel, liveStatus] = await Promise.all([providerHealth(), live.health()]);
    return json(res, 200, { ok:true, time:nowIso(), intelligence:intel, live:liveStatus, copyEngineConfigured:!!process.env.COPY_ENGINE_URL, pumpAvatarConfigured:!!process.env.PUMP_PROFILE_LOOKUP_URL });
  }
  if (route === '/api/live/status' && method === 'GET') return json(res,200,await live.health());
  if (route === '/api/live/sync-all' && method === 'POST') {
    if (!requireOwner(req,res,db)) return;
    return json(res,200,await live.syncAll());
  }
  if (route === '/api/me' && method === 'GET') return json(res, 200, { user:userFor(req, db), settings:{ platformName:getSetting(db,'platform_name','Shadow Intelligence') } });
  if (route === '/api/auth/register' && method === 'POST') {
    if (getSetting(db,'registration_enabled','true') !== 'true') return json(res,403,{error:'Registration is disabled'});
    const body = await readJson(req);
    const email = cleanEmail(body.email); const password = String(body.password || ''); const displayName = clean(body.displayName,60);
    if (!isEmail(email)) return json(res,400,{error:'Enter a valid email'});
    if (password.length < 8) return json(res,400,{error:'Password must be at least 8 characters'});
    if (!displayName) return json(res,400,{error:'Display name is required'});
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return json(res,409,{error:'Account already exists'});
    const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const role = totalUsers === 0 ? 'owner' : 'user';
    const userId = id('usr_');
    db.prepare('INSERT INTO users (id,email,password_hash,display_name,role,created_at) VALUES (?,?,?,?,?,?)').run(userId,email,hashPassword(password),displayName,role,nowIso());
    const session = createSession(db,userId); setSessionCookie(res,session.token);
    return json(res,201,{user:getUserFromSession(db,session.token)});
  }
  if (route === '/api/auth/login' && method === 'POST') {
    const body = await readJson(req); const email = cleanEmail(body.email);
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!row || !verifyPassword(body.password,row.password_hash)) return json(res,401,{error:'Invalid email or password'});
    const session = createSession(db,row.id); setSessionCookie(res,session.token);
    return json(res,200,{user:getUserFromSession(db,session.token)});
  }
  if (route === '/api/auth/logout' && method === 'POST') {
    deleteSession(db,parseCookies(req).si_session); clearSessionCookie(res); return json(res,200,{ok:true});
  }
  if (route === '/api/profile' && method === 'PATCH') {
    const user = requireUser(req,res,db); if (!user) return;
    const body = await readJson(req);
    const displayName = clean(body.displayName,60) || user.displayName;
    const bio = clean(body.bio,220); const xHandle = clean(body.xHandle,40);
    let avatar = String(body.avatar || '').trim();
    if (avatar && !(avatar.startsWith('data:image/') || isSafeHttpUrl(avatar))) return json(res,400,{error:'Avatar must be an image upload or safe URL'});
    if (avatar.length > 1_400_000) return json(res,413,{error:'Avatar is too large'});
    db.prepare('UPDATE users SET display_name=?,bio=?,x_handle=?,avatar=? WHERE id=?').run(displayName,bio,xHandle,avatar,user.id);
    return json(res,200,{user:userFor(req,db)});
  }
  if (route === '/api/overview' && method === 'GET') {
    const tracked = db.prepare('SELECT COUNT(*) AS n FROM entities').get().n;
    const alerts = db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE severity IN ('high','critical')").get().n;
    const losses = db.prepare('SELECT COALESCE(SUM(follower_losses),0) AS n FROM entities').get().n;
    const wallets = db.prepare('SELECT COUNT(*) AS n FROM wallets').get().n;
    const entities=entityRows(db); const selected=entities[0]||null;
    const selectedWallets=selected?db.prepare('SELECT * FROM wallets WHERE entity_id=? ORDER BY created_at').all(selected.id):[];
    const solUsd=selected?await currentSolUsd():0;
    const selectedTokens=selected?entityTokenPnlRows(db,selected.id,8,solUsd):[];
    return json(res,200,{ stats:{trackedEntities:tracked,activeAlerts:alerts,estimatedFollowerLosses:losses,linkedWallets:wallets}, feed:feedRows(db,20), leaderboard:entities.slice(0,8), groups:groups(db), selected, selectedWallets, selectedTokens });
  }
  if (route === '/api/feed' && method === 'GET') return json(res,200,{items:feedRows(db,Math.min(Number(url.searchParams.get('limit'))||50,100))});
  if (route === '/api/entities' && method === 'GET') return json(res,200,{items:entityRows(db)});
  if (route === '/api/entities' && method === 'POST') {
    if (!requireOwner(req,res,db)) return;
    const b=await readJson(req); const name=clean(b.name,80); if(!name)return json(res,400,{error:'Name required'});
    const entityId=id('ent_'); let avatar=String(b.avatar||'').trim();
    db.prepare(`INSERT INTO entities (id,name,x_handle,avatar,avatar_source,risk_score,confidence,incidents,follower_losses,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(entityId,name,clean(b.xHandle,50),avatar,avatar?'manual':'pending',Math.max(0,Math.min(100,Number.isFinite(Number(b.riskScore))?Number(b.riskScore):0)),Math.max(0,Math.min(100,Number.isFinite(Number(b.confidence))?Number(b.confidence):50)),0,0,clean(b.status,20)||'watch',clean(b.notes,500),nowIso());
    return json(res,201,{id:entityId});
  }
  /* SHADOW_ADMIN_ENTITY_V213_START */
  // Admin entity mutations.
  // POST aliases are the canonical UI path because they are reliable through
  // mobile browsers / preview proxies. PATCH + DELETE remain supported.
  const entityUpdateRoute =
    parts[0]==='api' && parts[1]==='entities' && parts[2] && (
      (parts.length===3 && method==='PATCH') ||
      (parts.length===4 && parts[3]==='update' && method==='POST')
    );

  if (entityUpdateRoute) {
    if (!requireOwner(req,res,db)) return;

    const current=db.prepare('SELECT * FROM entities WHERE id=?').get(parts[2]);
    if(!current)return json(res,404,{error:'Entity not found'});

    const b=await readJson(req);
    const has=(key)=>Object.hasOwn(b,key);

    const name=has('name')?clean(b.name,80):current.name;
    if(!name)return json(res,400,{error:'Name required'});

    const xHandle=has('xHandle')?clean(b.xHandle,50):current.x_handle;

    let avatar=has('avatar')?String(b.avatar||'').trim():String(current.avatar||'');
    if(avatar && !(avatar.startsWith('data:image/') || isSafeHttpUrl(avatar))){
      return json(res,400,{error:'Avatar must be an image upload or safe URL'});
    }
    if(avatar.length>1_400_000)return json(res,413,{error:'Avatar is too large'});

    const clamp100=(value,fallback)=>{
      const n=Number(value);
      return Number.isFinite(n)?Math.max(0,Math.min(100,n)):fallback;
    };

    const riskScore=has('riskScore')?clamp100(b.riskScore,current.risk_score):current.risk_score;
    const confidence=has('confidence')?clamp100(b.confidence,current.confidence):current.confidence;
    const status=has('status')?(clean(b.status,20)||current.status):current.status;
    const notes=has('notes')?clean(b.notes,500):current.notes;
    const avatarSource=has('avatar')?(avatar?'manual':'pending'):current.avatar_source;

    const changed=db.prepare(`
      UPDATE entities
      SET name=?,x_handle=?,avatar=?,avatar_source=?,risk_score=?,confidence=?,status=?,notes=?
      WHERE id=?
    `).run(
      name,xHandle,avatar,avatarSource,riskScore,confidence,status,notes,current.id
    ).changes;

    if(!changed)return json(res,409,{error:'Entity was not updated'});

    const updated=db.prepare('SELECT * FROM entities WHERE id=?').get(current.id);
    const walletCount=db.prepare('SELECT COUNT(*) AS n FROM wallets WHERE entity_id=?').get(current.id).n;

    return json(res,200,{
      ok:true,
      mutation:'update',
      version:'2.1.3',
      entity:{
        ...updated,
        riskScore:updated.risk_score,
        followerLosses:updated.follower_losses,
        xHandle:updated.x_handle,
        walletCount
      }
    });
  }

  const entityDeleteRoute =
    parts[0]==='api' && parts[1]==='entities' && parts[2] && (
      (parts.length===3 && method==='DELETE') ||
      (parts.length===4 && parts[3]==='delete' && method==='POST')
    );

  if (entityDeleteRoute) {
    if (!requireOwner(req,res,db)) return;

    const entity=db.prepare('SELECT * FROM entities WHERE id=?').get(parts[2]);
    if(!entity)return json(res,404,{error:'Entity not found'});

    const affectedTokens=db.prepare(`
      SELECT DISTINCT t.id,t.mint
      FROM tokens t
      WHERE t.id IN (
        SELECT token_id FROM incidents
        WHERE entity_id=? AND token_id IS NOT NULL
      )
      OR t.mint IN (
        SELECT mint FROM wallet_activity
        WHERE (entity_id=? OR wallet_id IN (SELECT id FROM wallets WHERE entity_id=?))
          AND mint<>''
      )
      OR t.mint IN (
        SELECT token_mint FROM evidence
        WHERE entity_id=? AND token_mint<>''
      )
    `).all(entity.id,entity.id,entity.id,entity.id);

    let removed={wallets:0,activity:0,evidence:0,incidents:0,social:0,orphanTokens:0};

    db.exec('BEGIN IMMEDIATE');
    try{
      removed.evidence=db.prepare('DELETE FROM evidence WHERE entity_id=?').run(entity.id).changes;
      removed.social=db.prepare('DELETE FROM social_posts WHERE entity_id=?').run(entity.id).changes;
      removed.incidents=db.prepare('DELETE FROM incidents WHERE entity_id=?').run(entity.id).changes;

      removed.activity=db.prepare(`
        DELETE FROM wallet_activity
        WHERE entity_id=?
           OR wallet_id IN (SELECT id FROM wallets WHERE entity_id=?)
      `).run(entity.id,entity.id).changes;

      db.prepare(`
        DELETE FROM copy_group_wallets
        WHERE wallet_id IN (SELECT id FROM wallets WHERE entity_id=?)
      `).run(entity.id);

      removed.wallets=db.prepare('DELETE FROM wallets WHERE entity_id=?').run(entity.id).changes;

      const deleted=db.prepare('DELETE FROM entities WHERE id=?').run(entity.id).changes;
      if(deleted!==1)throw new Error('Entity delete did not remove exactly one record');

      db.exec('COMMIT');
    }catch(error){
      try{db.exec('ROLLBACK')}catch{}
      throw error;
    }

    let cleanupWarning='';
    try{
      for(const token of affectedTokens){
        const stillUsed=db.prepare(`
          SELECT
            EXISTS(SELECT 1 FROM wallet_activity a WHERE a.mint=?) AS inActivity,
            EXISTS(SELECT 1 FROM incidents i WHERE i.token_id=?) AS inIncidents,
            EXISTS(SELECT 1 FROM evidence ev WHERE ev.token_mint=?) AS inEvidence
        `).get(token.mint,token.id,token.mint);

        if(!stillUsed.inActivity && !stillUsed.inIncidents && !stillUsed.inEvidence){
          removed.orphanTokens+=db.prepare('DELETE FROM tokens WHERE id=?').run(token.id).changes;
        }
      }
    }catch(error){
      cleanupWarning=String(error?.message||error);
      console.warn('Post-delete orphan token cleanup failed:',cleanupWarning);
    }

    const stillThere=db.prepare('SELECT 1 FROM entities WHERE id=?').get(entity.id);
    if(stillThere)return json(res,500,{error:'Entity still exists after delete transaction'});

    return json(res,200,{
      ok:true,
      mutation:'delete',
      version:'2.1.3',
      deletedId:entity.id,
      deletedName:entity.name,
      removed,
      cleanupWarning
    });
  }
  /* SHADOW_ADMIN_ENTITY_V213_END */

  if (parts[0]==='api' && parts[1]==='entities' && parts[2] && parts.length===3 && method==='GET') {
    const e=db.prepare('SELECT * FROM entities WHERE id=?').get(parts[2]); if(!e)return json(res,404,{error:'Entity not found'});
    const wallets=db.prepare('SELECT * FROM wallets WHERE entity_id=? ORDER BY created_at').all(e.id);
    const incidents=feedRows(db,100).filter(x=>x.entityId===e.id);
    const solUsd=await currentSolUsd();
    const tokens=entityTokenPnlRows(db,e.id,12,solUsd);
    const evidence=db.prepare('SELECT * FROM evidence WHERE entity_id=? ORDER BY created_at DESC').all(e.id);
    return json(res,200,{entity:{...e,riskScore:e.risk_score,followerLosses:e.follower_losses,xHandle:e.x_handle},wallets,tokens,incidents,evidence});
  }
  if (parts[0]==='api' && parts[1]==='entities' && parts[2] && parts[3]==='wallets' && method==='POST') {
    if (!requireOwner(req,res,db)) return;
    const b=await readJson(req); const address=clean(b.address,120); if(!address)return json(res,400,{error:'Wallet address required'});
    if(!isSolanaAddress(address))return json(res,400,{error:'Invalid Solana wallet address'});
    if(!db.prepare('SELECT id FROM entities WHERE id=?').get(parts[2]))return json(res,404,{error:'Entity not found'});
    if(db.prepare('SELECT 1 FROM wallets WHERE address=?').get(address))return json(res,409,{error:'Wallet already tracked'});
    const av=await resolveWalletAvatar(address); const walletId=id('wal_');
    db.prepare('INSERT INTO wallets (id,entity_id,address,label,avatar,avatar_source,sync_status,monitoring_enabled,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(walletId,parts[2],address,clean(b.label,80),av.avatar,av.source,'pending',1,nowIso());
    if(!db.prepare('SELECT avatar FROM entities WHERE id=?').get(parts[2])?.avatar) db.prepare('UPDATE entities SET avatar=?,avatar_source=? WHERE id=?').run(av.avatar,av.source,parts[2]);
    setTimeout(()=>live.syncWallet(walletId).catch(err=>console.warn('Initial wallet sync failed:',err.message)),0).unref?.();
    return json(res,201,{id:walletId,avatarSource:av.source,syncStatus:'pending'});
  }
  if (parts[0]==='api' && parts[1]==='wallets' && parts[2] && parts[3]==='sync-avatar' && method==='POST') {
    if (!requireOwner(req,res,db)) return;
    const w=db.prepare('SELECT * FROM wallets WHERE id=?').get(parts[2]); if(!w)return json(res,404,{error:'Wallet not found'});
    const av=await resolveWalletAvatar(w.address); db.prepare('UPDATE wallets SET avatar=?,avatar_source=? WHERE id=?').run(av.avatar,av.source,w.id);
    if(w.entity_id) db.prepare('UPDATE entities SET avatar=?,avatar_source=? WHERE id=?').run(av.avatar,av.source,w.entity_id);
    return json(res,200,av);
  }
  if (parts[0]==='api' && parts[1]==='wallets' && parts[2] && parts[3]==='sync' && method==='POST') {
    if (!requireOwner(req,res,db)) return;
    try { return json(res,200,await live.syncWallet(parts[2],{forceMarket:true})); }
    catch(error){ return json(res,502,{error:error.message}); }
  }
  if (parts[0]==='api' && parts[1]==='wallets' && parts[2] && parts[3]==='activity' && method==='GET') {
    const w=db.prepare('SELECT id FROM wallets WHERE id=?').get(parts[2]); if(!w)return json(res,404,{error:'Wallet not found'});
    const items=db.prepare(`SELECT * FROM wallet_activity WHERE wallet_id=? ORDER BY block_time DESC LIMIT ?`).all(parts[2],Math.min(Number(url.searchParams.get('limit'))||100,300));
    return json(res,200,{items});
  }
  if (parts[0]==='api' && parts[1]==='entities' && parts[2] && parts[3]==='sync' && method==='POST') {
    if (!requireOwner(req,res,db)) return;
    try { return json(res,200,await live.syncEntity(parts[2])); }
    catch(error){ return json(res,502,{error:error.message}); }
  }
  /* SHADOW_CURRENT_HOLDINGS_V219_API */
  if (route === '/api/tokens' && method === 'GET') {
    const items=db.prepare(`
      WITH current_positions AS (
        SELECT
          h.wallet_id,
          h.entity_id,
          h.mint,
          h.amount
        FROM wallet_holdings h
        JOIN wallets w ON w.id=h.wallet_id
        JOIN wallet_holdings_state s ON s.wallet_id=h.wallet_id
        WHERE w.entity_id IS NOT NULL
          AND COALESCE(s.last_success_at,'')<>''
          AND h.amount>1e-12

        UNION ALL

        -- Startup fallback only. Once a wallet has one successful on-chain
        -- snapshot, this branch is permanently disabled for that wallet.
        SELECT
          a.wallet_id,
          a.entity_id,
          a.mint,
          SUM(COALESCE(a.token_amount,0)) AS amount
        FROM wallet_activity a
        JOIN wallets w ON w.id=a.wallet_id
        LEFT JOIN wallet_holdings_state s ON s.wallet_id=a.wallet_id
        WHERE w.entity_id IS NOT NULL
          AND COALESCE(s.last_success_at,'')=''
          AND COALESCE(a.mint,'')<>''
        GROUP BY a.wallet_id,a.entity_id,a.mint
        HAVING SUM(COALESCE(a.token_amount,0))>1e-12
      ),
      held AS (
        SELECT
          mint,
          SUM(amount) AS held_amount,
          COUNT(DISTINCT wallet_id) AS holder_wallets,
          COUNT(DISTINCT entity_id) AS holder_entities
        FROM current_positions
        GROUP BY mint
        HAVING SUM(amount)>1e-12
      )
      SELECT
        t.*,
        held.held_amount AS held_amount,
        held.holder_wallets AS holder_wallets,
        held.holder_entities AS holder_entities,
        (
          SELECT MAX(h.updated_at)
          FROM wallet_holdings h
          WHERE h.mint=t.mint
        ) AS holdings_updated_at
      FROM tokens t
      JOIN held ON held.mint=t.mint
      ORDER BY COALESCE(t.last_market_at,t.created_at) DESC
    `).all();

    return json(res,200,{
      items,
      mode:'current-entity-holdings',
      authoritative:true
    });
  }
  /* SHADOW_CURRENT_HOLDINGS_V219_API_END */
  if (route === '/api/evidence' && method === 'GET') return json(res,200,{items:db.prepare(`SELECT e.*,u.display_name AS userName,en.name AS entityName FROM evidence e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN entities en ON en.id=e.entity_id ORDER BY e.created_at DESC LIMIT 100`).all()});
  if (route === '/api/evidence' && method === 'POST') {
    const user=requireUser(req,res,db); if(!user)return; const b=await readJson(req);
    const title=clean(b.title,120); if(!title)return json(res,400,{error:'Title required'});
    let image=String(b.image||''); if(image.length>1_400_000)return json(res,413,{error:'Image too large'});
    const entityId=clean(b.entityId,80)||null; const kind=clean(b.kind,30)||'note'; const tokenMint=clean(b.tokenMint,80); const tokenSymbol=clean(b.tokenSymbol,30); const observedAt=clean(b.observedAt,50)||nowIso();
    if(tokenMint && !isSolanaAddress(tokenMint))return json(res,400,{error:'Token mint is not a valid Solana address'});
    const evidenceId=id('ev_');
    db.prepare('INSERT INTO evidence (id,user_id,entity_id,title,kind,source_url,image,note,created_at,observed_at,token_mint,token_symbol) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(evidenceId,user.id,entityId,title,kind,clean(b.sourceUrl,500),image,clean(b.note,1000),nowIso(),observedAt,tokenMint,tokenSymbol);
    if(entityId && (kind==='x_post'||kind==='social') && (clean(b.sourceUrl,500)||clean(b.note,1000))){
      const external=`evidence:${evidenceId}`; const text=clean(b.note,1200)||title;
      db.prepare('INSERT OR IGNORE INTO social_posts (id,entity_id,external_id,source,text,url,token_mint,token_symbol,posted_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id('post_'),entityId,external,'evidence',text,clean(b.sourceUrl,500),tokenMint,tokenSymbol,observedAt,nowIso());
      live.recomputeEntity(entityId);
    }
    return json(res,201,{ok:true,id:evidenceId});
  }
  if (route === '/api/chat/messages' && method === 'GET') {
    if(getSetting(db,'community_chat_enabled','true')!=='true')return json(res,403,{error:'Community chat disabled'});
    return json(res,200,{items:db.prepare(`SELECT c.id,c.body,c.created_at AS createdAt,u.id AS userId,u.display_name AS displayName,u.avatar,u.role FROM chat_messages c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 80`).all().reverse()});
  }
  if (route === '/api/chat/messages' && method === 'POST') {
    if(getSetting(db,'community_chat_enabled','true')!=='true')return json(res,403,{error:'Community chat disabled'});
    const user=requireUser(req,res,db); if(!user)return;
    const b=await readJson(req);
    const body=clean(b.body,800);
    if(!body)return json(res,400,{error:'Message cannot be empty'});

    const chatId=id('chat_');
    const createdAt=nowIso();

    db.prepare('INSERT INTO chat_messages (id,user_id,body,created_at) VALUES (?,?,?,?)')
      .run(chatId,user.id,body,createdAt);

    return json(res,201,{
      ok:true,
      item:{
        id:chatId,
        body,
        createdAt,
        userId:user.id,
        displayName:user.displayName,
        avatar:user.avatar||'',
        role:user.role
      }
    });
  }
  if (route === '/api/users' && method === 'GET') {
    const user=requireUser(req,res,db); if(!user)return; const q=`%${clean(url.searchParams.get('q'),80)}%`;
    const rows=db.prepare('SELECT id,display_name AS displayName,avatar,bio,x_handle AS xHandle,role FROM users WHERE id<>? AND (display_name LIKE ? OR email LIKE ? OR x_handle LIKE ?) ORDER BY display_name LIMIT 30').all(user.id,q,q,q);
    return json(res,200,{items:rows});
  }
  if (route === '/api/conversations' && method === 'GET') {
    const user=requireUser(req,res,db); if(!user)return;
    const rows=db.prepare(`SELECT u.id,u.display_name AS displayName,u.avatar,u.x_handle AS xHandle,MAX(d.created_at) AS lastAt,
      (SELECT body FROM direct_messages x WHERE ((x.sender_id=? AND x.recipient_id=u.id) OR (x.sender_id=u.id AND x.recipient_id=?)) ORDER BY x.created_at DESC LIMIT 1) AS lastBody
      FROM users u JOIN direct_messages d ON (d.sender_id=u.id OR d.recipient_id=u.id)
      WHERE u.id<>? AND (d.sender_id=? OR d.recipient_id=?) GROUP BY u.id ORDER BY lastAt DESC`).all(user.id,user.id,user.id,user.id,user.id);
    return json(res,200,{items:rows});
  }
  if (parts[0]==='api' && parts[1]==='dm' && parts[2] && method==='GET') {
    const user=requireUser(req,res,db); if(!user)return; const other=parts[2];
    const otherUser=db.prepare('SELECT id,display_name AS displayName,avatar,x_handle AS xHandle FROM users WHERE id=?').get(other); if(!otherUser)return json(res,404,{error:'User not found'});
    const items=db.prepare(`SELECT id,sender_id AS senderId,recipient_id AS recipientId,body,created_at AS createdAt FROM direct_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at LIMIT 200`).all(user.id,other,other,user.id);
    return json(res,200,{user:otherUser,items});
  }
  if (parts[0]==='api' && parts[1]==='dm' && parts[2] && method==='POST') {
    const user=requireUser(req,res,db); if(!user)return; const b=await readJson(req); const body=clean(b.body,1200); if(!body)return json(res,400,{error:'Message cannot be empty'});
    if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(parts[2]))return json(res,404,{error:'User not found'});
    db.prepare('INSERT INTO direct_messages (id,sender_id,recipient_id,body,created_at) VALUES (?,?,?,?,?)').run(id('dm_'),user.id,parts[2],body,nowIso()); return json(res,201,{ok:true});
  }
  /* SHADOW_USER_COPY_TRADING_V230_ROUTES */
  /* SHADOW_WALLET_AUTH_V235_SERVER */
  if (route === '/api/wallet-auth/challenge' && method === 'POST') {
    const b=await readJson(req);
    const address=clean(b.address,120);
    if(!isSolanaAddress(address))return json(res,400,{error:'Invalid Solana wallet address'});

    const challengeId=id('wlogin_');
    const expiresAt=new Date(Date.now()+5*60*1000).toISOString();
    const nonce=crypto.randomBytes(24).toString('hex');
    const host=String(req.headers.host||'Shadow Intelligence');

    const message=[
      'Shadow Intelligence wallet verification',
      `Domain: ${host}`,
      `Wallet: ${address}`,
      `Nonce: ${nonce}`,
      `Expires: ${expiresAt}`,
      '',
      'This signature proves wallet ownership. It does not authorize a transaction.'
    ].join('\n');

    // Keep the challenge table bounded.
    db.prepare("DELETE FROM wallet_login_challenges WHERE used_at<>'' OR expires_at<?")
      .run(nowIso());

    db.prepare(`
      INSERT INTO wallet_login_challenges
        (id,address,message,expires_at,used_at,created_at)
      VALUES (?,?,?,?,'',?)
    `).run(challengeId,address,message,expiresAt,nowIso());

    return json(res,200,{challengeId,message,expiresAt});
  }

  if (route === '/api/wallet-auth/verify' && method === 'POST') {
    const b=await readJson(req);
    const challengeId=clean(b.challengeId,120);
    const address=clean(b.address,120);
    const provider=clean(b.provider,40)||'solana';
    const signature=String(b.signature||'');

    if(!isSolanaAddress(address))return json(res,400,{error:'Invalid Solana wallet address'});

    const ch=db.prepare(`
      SELECT * FROM wallet_login_challenges
      WHERE id=? AND address=?
    `).get(challengeId,address);

    if(!ch)return json(res,404,{error:'Wallet verification challenge not found'});
    if(ch.used_at)return json(res,409,{error:'Wallet verification challenge already used'});
    if(new Date(ch.expires_at).getTime()<Date.now())return json(res,410,{error:'Wallet verification challenge expired'});
    if(!verifySolanaMessage(address,ch.message,signature)){
      return json(res,401,{error:'Wallet signature verification failed'});
    }

    const at=nowIso();
    const current=userFor(req,db);
    const linked=db.prepare(`
      SELECT uw.*,u.role,u.email
      FROM user_wallets uw
      JOIN users u ON u.id=uw.user_id
      WHERE uw.address=?
      ORDER BY uw.verified_at DESC
      LIMIT 1
    `).get(address);

    let userId='';

    if(current){
      // A signed-in account can attach the wallet unless another account owns it.
      if(linked && linked.user_id!==current.id){
        return json(res,409,{error:'This wallet is already linked to another account'});
      }
      userId=current.id;
    }else if(linked){
      // Never let a public wallet-only login silently elevate into owner/admin.
      if(linked.role==='owner'||linked.role==='admin'){
        return json(res,403,{error:'Admin wallet requires normal account sign-in first'});
      }
      userId=linked.user_id;
    }else{
      // Wallet is the login identity. Create a normal user account with an
      // unreachable random password; no email/password flow is required.
      const digest=crypto.createHash('sha256').update(address).digest('hex').slice(0,24);
      const syntheticEmail=`wallet.${digest}@wallet.shadow.local`;
      const existingSynthetic=db.prepare('SELECT id FROM users WHERE email=?').get(syntheticEmail);

      userId=existingSynthetic?.id||id('usr_');

      if(!existingSynthetic){
        const displayName=`Wallet ${address.slice(0,4)}…${address.slice(-4)}`;
        const unusablePassword=crypto.randomBytes(48).toString('hex');
        db.prepare(`
          INSERT INTO users
            (id,email,password_hash,display_name,role,created_at)
          VALUES (?,?,?,?, 'user', ?)
        `).run(
          userId,
          syntheticEmail,
          hashPassword(unusablePassword),
          displayName,
          at
        );
      }
    }

    const existingWallet=db.prepare(`
      SELECT * FROM user_wallets
      WHERE user_id=? AND address=?
    `).get(userId,address);

    const walletId=existingWallet?.id||id('uw_');

    if(existingWallet){
      db.prepare('UPDATE user_wallets SET provider=?,verified_at=? WHERE id=?')
        .run(provider,at,walletId);
    }else{
      db.prepare(`
        INSERT INTO user_wallets
          (id,user_id,address,provider,verified_at,created_at)
        VALUES (?,?,?,?,?,?)
      `).run(walletId,userId,address,provider,at,at);
    }

    db.prepare('UPDATE wallet_login_challenges SET used_at=? WHERE id=?')
      .run(at,ch.id);

    // Wallet verification itself logs normal users in.
    let sessionToken=parseCookies(req).si_session||'';
    let sessionUser=sessionToken?getUserFromSession(db,sessionToken):null;

    if(!sessionUser || sessionUser.id!==userId){
      const session=createSession(db,userId);
      sessionToken=session.token;
      setSessionCookie(res,session.token);
    }

    const user=getUserFromSession(db,sessionToken);
    const wallet=userWalletRows(db,userId).find(w=>w.id===walletId);

    return json(res,200,{
      ok:true,
      user,
      wallet,
      walletLogin:!current
    });
  }
  /* SHADOW_WALLET_AUTH_V235_SERVER_END */

  if (route === '/api/user-wallets' && method === 'GET') {
    const user=requireUser(req,res,db); if(!user)return;
    return json(res,200,{items:userWalletRows(db,user.id)});
  }

  if (route === '/api/user-wallets/challenge' && method === 'POST') {
    const user=requireUser(req,res,db); if(!user)return;
    const b=await readJson(req);
    const address=clean(b.address,120);
    if(!isSolanaAddress(address))return json(res,400,{error:'Invalid Solana wallet address'});

    const challengeId=id('wch_');
    const expiresAt=new Date(Date.now()+5*60*1000).toISOString();
    const nonce=crypto.randomBytes(24).toString('hex');
    const message=[
      'Shadow Intelligence wallet verification',
      `Wallet: ${address}`,
      `Nonce: ${nonce}`,
      `Expires: ${expiresAt}`,
      '',
      'This signature proves wallet ownership. It does not authorize a transaction.'
    ].join('\n');

    db.prepare('DELETE FROM wallet_connect_challenges WHERE user_id=? AND (used_at<>? OR expires_at<?)')
      .run(user.id,'',nowIso());
    db.prepare(`
      INSERT INTO wallet_connect_challenges
        (id,user_id,address,message,expires_at,used_at,created_at)
      VALUES (?,?,?,?,?,'',?)
    `).run(challengeId,user.id,address,message,expiresAt,nowIso());

    return json(res,200,{challengeId,message,expiresAt});
  }

  if (route === '/api/user-wallets/verify' && method === 'POST') {
    const user=requireUser(req,res,db); if(!user)return;
    const b=await readJson(req);
    const challengeId=clean(b.challengeId,120);
    const address=clean(b.address,120);
    const provider=clean(b.provider,40)||'solana';
    const signature=String(b.signature||'');

    if(!isSolanaAddress(address))return json(res,400,{error:'Invalid Solana wallet address'});
    const ch=db.prepare(`
      SELECT * FROM wallet_connect_challenges
      WHERE id=? AND user_id=? AND address=?
    `).get(challengeId,user.id,address);

    if(!ch)return json(res,404,{error:'Wallet verification challenge not found'});
    if(ch.used_at)return json(res,409,{error:'Wallet verification challenge already used'});
    if(new Date(ch.expires_at).getTime()<Date.now())return json(res,410,{error:'Wallet verification challenge expired'});
    if(!verifySolanaMessage(address,ch.message,signature))return json(res,401,{error:'Wallet signature verification failed'});

    const existing=db.prepare('SELECT * FROM user_wallets WHERE user_id=? AND address=?').get(user.id,address);
    const walletId=existing?.id||id('uw_');
    const at=nowIso();

    if(existing){
      db.prepare('UPDATE user_wallets SET provider=?,verified_at=? WHERE id=?')
        .run(provider,at,walletId);
    }else{
      db.prepare(`
        INSERT INTO user_wallets (id,user_id,address,provider,verified_at,created_at)
        VALUES (?,?,?,?,?,?)
      `).run(walletId,user.id,address,provider,at,at);
    }

    db.prepare('UPDATE wallet_connect_challenges SET used_at=? WHERE id=?').run(at,ch.id);
    return json(res,200,{ok:true,wallet:userWalletRows(db,user.id).find(w=>w.id===walletId)});
  }

  if (parts[0]==='api' && parts[1]==='user-wallets' && parts[2] && parts.length===3 && method==='DELETE') {
    const user=requireUser(req,res,db); if(!user)return;
    const row=db.prepare('SELECT id FROM user_wallets WHERE id=? AND user_id=?').get(parts[2],user.id);
    if(!row)return json(res,404,{error:'Wallet not found'});
    db.prepare('DELETE FROM user_wallets WHERE id=? AND user_id=?').run(parts[2],user.id);
    return json(res,200,{ok:true});
  }

  if (route === '/api/copy-subscriptions' && method === 'GET') {
    const user=requireUser(req,res,db); if(!user)return;
    const rows=db.prepare(`
      SELECT entity_id FROM copy_subscriptions
      WHERE user_id=? ORDER BY updated_at DESC
    `).all(user.id);
    return json(res,200,{items:rows.map(r=>copySubscriptionRow(db,user.id,r.entity_id))});
  }

  if (parts[0]==='api' && parts[1]==='entities' && parts[2] && parts[3]==='copy' && parts.length===4 && method==='GET') {
    const user=requireUser(req,res,db); if(!user)return;
    if(!db.prepare('SELECT 1 FROM entities WHERE id=?').get(parts[2]))return json(res,404,{error:'Entity not found'});
    return json(res,200,{
      subscription:copySubscriptionRow(db,user.id,parts[2]),
      wallets:userWalletRows(db,user.id),
      engineConfigured:!!process.env.COPY_ENGINE_URL,
      copyTradingEnabled:getSetting(db,'copy_trading_enabled','true')==='true'
    });
  }

  if (parts[0]==='api' && parts[1]==='entities' && parts[2] && parts[3]==='copy' && parts.length===4 && method==='PUT') {
    const user=requireUser(req,res,db); if(!user)return;
    if(getSetting(db,'copy_trading_enabled','true')!=='true')return json(res,403,{error:'Copy trading is disabled'});

    const entity=db.prepare('SELECT * FROM entities WHERE id=?').get(parts[2]);
    if(!entity)return json(res,404,{error:'Entity not found'});

    const b=await readJson(req);
    const walletId=clean(b.walletId,120);
    const wallet=db.prepare('SELECT * FROM user_wallets WHERE id=? AND user_id=?').get(walletId,user.id);
    if(!wallet)return json(res,400,{error:'Connect and verify your Solana wallet first'});

    const amountSol=numBetween(b.amountSol,0.001,100,0.05);
    const maxPositionSol=numBetween(b.maxPositionSol,amountSol,1000,Math.max(0.5,amountSol));
    const maxDailySol=numBetween(b.maxDailySol,amountSol,10000,Math.max(1,amountSol));
    const slippageBps=Math.round(numBetween(b.slippageBps,10,3000,500));
    const copyBuys=b.copyBuys!==false?1:0;
    const copySells=b.copySells!==false?1:0;
    const sellPercent=Math.round(numBetween(b.sellPercent,1,100,100));
    const requestedEnabled=!!b.enabled;
    const at=nowIso();

    let sub=db.prepare('SELECT * FROM copy_subscriptions WHERE user_id=? AND entity_id=?').get(user.id,entity.id);
    const subId=sub?.id||id('cps_');

    if(sub){
      db.prepare(`
        UPDATE copy_subscriptions SET
          user_wallet_id=?,amount_sol=?,max_position_sol=?,max_daily_sol=?,
          slippage_bps=?,copy_buys=?,copy_sells=?,sell_percent=?,updated_at=?
        WHERE id=? AND user_id=?
      `).run(wallet.id,amountSol,maxPositionSol,maxDailySol,slippageBps,copyBuys,copySells,sellPercent,at,subId,user.id);
    }else{
      db.prepare(`
        INSERT INTO copy_subscriptions
          (id,user_id,user_wallet_id,entity_id,enabled,amount_sol,max_position_sol,max_daily_sol,
           slippage_bps,copy_buys,copy_sells,sell_percent,engine_state,last_error,created_at,updated_at)
        VALUES (?,?,?,?,0,?,?,?,?,?,?,?,'draft','',?,?)
      `).run(subId,user.id,wallet.id,entity.id,amountSol,maxPositionSol,maxDailySol,slippageBps,copyBuys,copySells,sellPercent,at,at);
    }

    sub=db.prepare('SELECT * FROM copy_subscriptions WHERE id=?').get(subId);
    const entityWallets=db.prepare(`
      SELECT * FROM wallets
      WHERE entity_id=? AND monitoring_enabled=1
      ORDER BY created_at
    `).all(entity.id);

    if(!requestedEnabled){
      let engine={configured:!!process.env.COPY_ENGINE_URL,ok:true,active:false,mode:'local'};
      if(process.env.COPY_ENGINE_URL){
        try{
          engine=await syncCopySubscription({...sub,enabled:false,walletAddress:wallet.address},entityWallets,'disable');
        }catch(error){
          engine={configured:true,ok:false,active:false,error:String(error.message||error)};
        }
      }
      db.prepare("UPDATE copy_subscriptions SET enabled=0,engine_state='stopped',last_error='',updated_at=? WHERE id=?")
        .run(nowIso(),subId);
      return json(res,200,{ok:true,subscription:copySubscriptionRow(db,user.id,entity.id),engine});
    }

    if(!process.env.COPY_ENGINE_URL){
      db.prepare("UPDATE copy_subscriptions SET enabled=0,engine_state='engine_required',last_error=?,updated_at=? WHERE id=?")
        .run('COPY_ENGINE_URL is not configured',nowIso(),subId);
      return json(res,409,{
        error:'Automatic copy execution is not configured yet',
        code:'COPY_ENGINE_REQUIRED',
        subscription:copySubscriptionRow(db,user.id,entity.id)
      });
    }

    let engine;
    try{
      engine=await syncCopySubscription({
        ...sub,
        enabled:true,
        walletAddress:wallet.address,
        userId:user.id,
        entityId:entity.id,
        entityName:entity.name
      },entityWallets,'upsert');
    }catch(error){
      db.prepare("UPDATE copy_subscriptions SET enabled=0,engine_state='error',last_error=?,updated_at=? WHERE id=?")
        .run(String(error.message||error).slice(0,500),nowIso(),subId);
      return json(res,502,{error:`Copy engine: ${error.message||error}`,code:'COPY_ENGINE_ERROR'});
    }

    const active=engine?.active===true;
    const engineState=active?'active':engine?.authorizationUrl?'authorization_required':'pending';
    db.prepare('UPDATE copy_subscriptions SET enabled=?,engine_state=?,last_error=?,updated_at=? WHERE id=?')
      .run(active?1:0,engineState,active?'':'Execution engine has not activated this subscription yet',nowIso(),subId);

    return json(res,200,{
      ok:true,
      subscription:copySubscriptionRow(db,user.id,entity.id),
      engine,
      requiresAuthorization:!active&&!!engine?.authorizationUrl,
      authorizationUrl:engine?.authorizationUrl||''
    });
  }
  /* SHADOW_USER_COPY_TRADING_V230_ROUTES_END */

  if (route === '/api/copy-groups' && method === 'GET') return json(res,200,{items:groups(db)});
  if (parts[0]==='api' && parts[1]==='copy-groups' && parts[2] && parts.length===3 && method==='GET') {
    const g=db.prepare('SELECT * FROM copy_groups WHERE id=?').get(parts[2]); if(!g)return json(res,404,{error:'Group not found'});
    const wallets=db.prepare(`SELECT w.*,e.name AS entityName,e.x_handle AS xHandle FROM wallets w JOIN copy_group_wallets c ON c.wallet_id=w.id LEFT JOIN entities e ON e.id=w.entity_id WHERE c.group_id=? ORDER BY e.name,w.created_at`).all(g.id);
    const available=db.prepare(`SELECT w.*,e.name AS entityName,e.x_handle AS xHandle FROM wallets w LEFT JOIN entities e ON e.id=w.entity_id WHERE w.id NOT IN (SELECT wallet_id FROM copy_group_wallets WHERE group_id=?) ORDER BY e.name,w.created_at`).all(g.id);
    return json(res,200,{group:{...g,enabled:!!g.enabled},wallets,available});
  }
  if (route === '/api/copy-groups' && method === 'POST') {
    if(!requireOwner(req,res,db))return; const b=await readJson(req); const name=clean(b.name,80); if(!name)return json(res,400,{error:'Name required'});
    const groupId=id('grp_'); db.prepare('INSERT INTO copy_groups (id,name,mode,enabled,created_at) VALUES (?,?,?,?,?)').run(groupId,name,clean(b.mode,20)||'watch',0,nowIso()); return json(res,201,{id:groupId});
  }
  if (parts[0]==='api' && parts[1]==='copy-groups' && parts[2] && parts[3]==='wallets' && method==='POST') {
    if(!requireOwner(req,res,db))return; const b=await readJson(req); const walletId=clean(b.walletId,100); if(!db.prepare('SELECT 1 FROM wallets WHERE id=?').get(walletId))return json(res,404,{error:'Wallet not found'});
    db.prepare('INSERT OR IGNORE INTO copy_group_wallets (group_id,wallet_id) VALUES (?,?)').run(parts[2],walletId); return json(res,201,{ok:true});
  }
  if (parts[0]==='api' && parts[1]==='copy-groups' && parts[2] && parts[3]==='wallets' && parts[4] && method==='DELETE') {
    if(!requireOwner(req,res,db))return;
    db.prepare('DELETE FROM copy_group_wallets WHERE group_id=? AND wallet_id=?').run(parts[2],parts[4]); return json(res,200,{ok:true});
  }
  if (parts[0]==='api' && parts[1]==='copy-groups' && parts[2] && parts[3]==='toggle' && method==='POST') {
    if(!requireOwner(req,res,db))return; const g=db.prepare('SELECT * FROM copy_groups WHERE id=?').get(parts[2]); if(!g)return json(res,404,{error:'Group not found'});
    const enabled=g.enabled?0:1; db.prepare('UPDATE copy_groups SET enabled=? WHERE id=?').run(enabled,g.id);
    const wallets=db.prepare(`SELECT w.* FROM wallets w JOIN copy_group_wallets c ON c.wallet_id=w.id WHERE c.group_id=?`).all(g.id);
    let engine; try{engine=await syncCopyGroup({...g,enabled:!!enabled},wallets);}catch(err){engine={ok:false,error:err.message};}
    return json(res,200,{enabled:!!enabled,engine});
  }
  if (route === '/api/settings' && method === 'GET') {
    const user=requireUser(req,res,db); if(!user)return;
    const all=getAllSettings(db); if(user.role!=='owner'&&user.role!=='admin') return json(res,200,{platform_name:all.platform_name,community_chat_enabled:all.community_chat_enabled});
    return json(res,200,all);
  }
  if (route === '/api/settings' && method === 'PATCH') {
    if(!requireOwner(req,res,db))return; const b=await readJson(req);
    const allowed=['platform_name','registration_enabled','community_chat_enabled','copy_trading_enabled','risk_high_threshold','demo_mode','live_monitor_enabled','live_poll_seconds','wallet_history_limit','x_monitor_enabled'];
    const stmt=db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    for(const key of allowed) if(Object.hasOwn(b,key)) stmt.run(key,String(b[key]));
    return json(res,200,getAllSettings(db));
  }
  return json(res,404,{error:'API route not found'});
}

function serveStatic(req,res,url){
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if(!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if(!fs.existsSync(full) || fs.statSync(full).isDirectory()) { rel='/index.html'; }
  const target = path.normalize(path.join(PUBLIC_DIR, rel));
  const ext=path.extname(target); const body=fs.readFileSync(target);
  res.writeHead(200,{'content-type':MIME[ext]||'application/octet-stream','content-length':body.length,'cache-control':(ext==='.html'||ext==='.css'||ext==='.js')?'no-store':'public, max-age=3600'}); res.end(body);
}

export function createServer({dbPath,fetchImpl=fetch,autoMonitor=false}={}) {
  const db=openDb(dbPath);
  const live=createLiveIntelligence(db,{fetchImpl});
  let tokenImageBackfillTimer=null;
  // Startup repair belongs only to the real long-lived app server.
  // Unit/smoke tests create short-lived servers with autoMonitor=false;
  // scheduling delayed DB work there races server.close() and produces
  // misleading "database is not open" warnings after the tests pass.
  if(autoMonitor){
    tokenImageBackfillTimer=setTimeout(()=>{
      backfillMissingTokenImages(db)
        .then(result=>{
          if(result?.updated)console.log(`Token image backfill: ${result.updated}/${result.checked} updated`);
          else if(result?.skipped)console.log(`Token image backfill skipped: ${result.reason}`);
        })
        .catch(error=>console.warn('Token image backfill failed:',error.message));
    },1200);
    tokenImageBackfillTimer.unref?.();
  }
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live); else serveStatic(req,res,url);
    }catch(err){ console.error(err); if(!res.headersSent)json(res,err.statusCode||500,{error:err.statusCode?err.message:'Internal server error'}); else res.end(); }
  });
  if(autoMonitor) live.start();
  server.on('close',()=>{ if(tokenImageBackfillTimer)clearTimeout(tokenImageBackfillTimer); try{live.stop();}catch{} try{db.close();}catch{} });
  return server;
}

export function startServer({port=Number(process.env.PORT)||3000,dbPath}={}){
  const server=createServer({dbPath,autoMonitor:true});
  server.listen(port,'0.0.0.0',()=>console.log(`Shadow Intelligence LIVE running on http://0.0.0.0:${server.address().port}`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) startServer();
