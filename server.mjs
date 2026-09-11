import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb, getAllSettings, getSetting } from './src/db.mjs';
import { hashPassword, verifyPassword, createSession, deleteSession, getUserFromSession, setSessionCookie, clearSessionCookie } from './src/auth.mjs';
import { clean, cleanEmail, isEmail, id, nowIso, json, parseCookies, readJson, maskWallet, isSafeHttpUrl, isSolanaAddress } from './src/utils.mjs';
import { resolveWalletAvatar } from './src/adapters/pump-profile.mjs';
import { syncCopyGroup } from './src/adapters/copy-trading.mjs';
import { providerHealth } from './src/adapters/intelligence.mjs';
import { createLiveIntelligence } from './src/live-intelligence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

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
      w.address AS walletAddress,t.symbol,t.name AS tokenName,t.price_change AS priceChange
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
    const selectedTokens=selected?db.prepare(`SELECT t.*,MAX(a.block_time) AS lastActivity FROM tokens t JOIN wallet_activity a ON a.mint=t.mint WHERE a.entity_id=? GROUP BY t.id ORDER BY lastActivity DESC LIMIT 8`).all(selected.id):[];
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
  if (parts[0]==='api' && parts[1]==='entities' && parts[2] && parts.length===3 && method==='GET') {
    const e=db.prepare('SELECT * FROM entities WHERE id=?').get(parts[2]); if(!e)return json(res,404,{error:'Entity not found'});
    const wallets=db.prepare('SELECT * FROM wallets WHERE entity_id=? ORDER BY created_at').all(e.id);
    const incidents=feedRows(db,100).filter(x=>x.entityId===e.id);
    const evidence=db.prepare('SELECT * FROM evidence WHERE entity_id=? ORDER BY created_at DESC').all(e.id);
    return json(res,200,{entity:{...e,riskScore:e.risk_score,followerLosses:e.follower_losses,xHandle:e.x_handle},wallets,incidents,evidence});
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
  if (route === '/api/tokens' && method === 'GET') return json(res,200,{items:db.prepare('SELECT * FROM tokens ORDER BY COALESCE(last_market_at,created_at) DESC').all()});
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
    const user=requireUser(req,res,db); if(!user)return; const b=await readJson(req); const body=clean(b.body,800); if(!body)return json(res,400,{error:'Message cannot be empty'});
    db.prepare('INSERT INTO chat_messages (id,user_id,body,created_at) VALUES (?,?,?,?)').run(id('chat_'),user.id,body,nowIso()); return json(res,201,{ok:true});
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
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live); else serveStatic(req,res,url);
    }catch(err){ console.error(err); if(!res.headersSent)json(res,err.statusCode||500,{error:err.statusCode?err.message:'Internal server error'}); else res.end(); }
  });
  if(autoMonitor) live.start();
  server.on('close',()=>{ try{live.stop();}catch{} try{db.close();}catch{} });
  return server;
}

export function startServer({port=Number(process.env.PORT)||3000,dbPath}={}){
  const server=createServer({dbPath,autoMonitor:true});
  server.listen(port,'0.0.0.0',()=>console.log(`Shadow Intelligence LIVE running on http://0.0.0.0:${server.address().port}`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) startServer();
