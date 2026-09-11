import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { isSolanaAddress } from '../src/utils.mjs';

const WALLET='5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij';
const MINT='A55XjvzRU4KtR3Lrys8PpLZQvPojPqvnv5bJVHMYy3Jv';
const SIG='5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqokgpiKRLuS83KUxyZyv2sUYv';
const PUMP='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}
async function fakeFetch(input,init={}){
  const url=String(input);
  if(url.startsWith('https://api.dexscreener.com/')){
    return response([{chainId:'solana',dexId:'pumpfun',url:`https://dexscreener.com/solana/pair`,baseToken:{address:MINT,name:'Test Pump Token',symbol:'TST'},quoteToken:{address:'So11111111111111111111111111111111111111112',name:'Wrapped SOL',symbol:'SOL'},priceUsd:'0.0025',priceChange:{h1:12.4},liquidity:{usd:50000},marketCap:1250000,info:{imageUrl:'https://example.com/token.png'}}]);
  }
  if(url.startsWith('https://api.mainnet-beta.solana.com')||url.includes('helius-rpc.com')){
    const body=JSON.parse(init.body||'{}');
    if(body.method==='getHealth')return response({jsonrpc:'2.0',id:1,result:'ok'});
    if(body.method==='getSignaturesForAddress')return response({jsonrpc:'2.0',id:1,result:[{signature:SIG,slot:123,err:null,blockTime:1760000000,confirmationStatus:'confirmed'}]});
    if(body.method==='getTransaction')return response({jsonrpc:'2.0',id:1,result:{slot:123,blockTime:1760000000,transaction:{message:{accountKeys:[{pubkey:WALLET,signer:true,writable:true}],instructions:[{programId:PUMP}]}},meta:{err:null,preBalances:[10_000_000_000],postBalances:[9_000_000_000],preTokenBalances:[{owner:WALLET,mint:MINT,uiTokenAmount:{uiAmount:0,decimals:6,amount:'0'}}],postTokenBalances:[{owner:WALLET,mint:MINT,uiTokenAmount:{uiAmount:1000,decimals:6,amount:'1000000000'}}],innerInstructions:[]}}});
  }
  throw new Error(`Unexpected fetch ${url}`);
}

async function withServer(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'si-test-'));
  const dbPath=path.join(dir,'test.db');
  const oldHelius=process.env.HELIUS_API_KEY,oldRpc=process.env.SOLANA_RPC_URL,oldOwner=process.env.OWNER_EMAIL;
  delete process.env.HELIUS_API_KEY; delete process.env.SOLANA_RPC_URL; delete process.env.OWNER_EMAIL; delete process.env.OWNER_PASSWORD;
  const server=createServer({dbPath,fetchImpl:fakeFetch,autoMonitor:false});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{await fn(base)}finally{
    await new Promise(r=>server.close(r)); fs.rmSync(dir,{recursive:true,force:true});
    if(oldHelius===undefined)delete process.env.HELIUS_API_KEY;else process.env.HELIUS_API_KEY=oldHelius;
    if(oldRpc===undefined)delete process.env.SOLANA_RPC_URL;else process.env.SOLANA_RPC_URL=oldRpc;
    if(oldOwner===undefined)delete process.env.OWNER_EMAIL;else process.env.OWNER_EMAIL=oldOwner;
  }
}

async function registerOwner(base){
  const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:'Owner Test',email:'owner@test.local',password:'password123'})});
  assert.equal(r.status,201);
  const body=await r.json(); assert.equal(body.user.role,'owner');
  return (r.headers.get('set-cookie')||'').split(';')[0];
}

async function authed(base,path,cookie,options={}){
  return fetch(base+path,{...options,headers:{'content-type':'application/json',cookie,...(options.headers||{})}});
}

test('wallet validator accepts the real sling wallet address',()=>{assert.equal(isSolanaAddress(WALLET),true)});

test('health and clean live overview work without demo entities',async()=>withServer(async base=>{
  const h=await fetch(base+'/api/health').then(r=>r.json());
  assert.equal(h.ok,true); assert.equal(h.live.solana.status,'online');
  const o=await fetch(base+'/api/overview').then(r=>r.json());
  assert.equal(o.stats.trackedEntities,0); assert.equal(o.feed.length,0);
}));

test('first registered user becomes owner',async()=>withServer(async base=>{await registerOwner(base)}));

test('tracked wallet sync produces a real on-chain activity row, token, and live-feed incident',async()=>withServer(async base=>{
  const cookie=await registerOwner(base);
  let r=await authed(base,'/api/entities',cookie,{method:'POST',body:JSON.stringify({name:'sling',xHandle:'@slingoorio',riskScore:0,confidence:100,notes:'Wallet ownership confirmed.'})});
  assert.equal(r.status,201); const entity=await r.json();
  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:WALLET,label:'Main wallet'})});
  assert.equal(r.status,201); const wallet=await r.json();
  // Explicit sync is deterministic even if the background post-create sync already ran.
  r=await authed(base,`/api/wallets/${wallet.id}/sync`,cookie,{method:'POST',body:'{}'});
  assert.equal(r.status,200);
  const activity=await fetch(base+`/api/wallets/${wallet.id}/activity`).then(x=>x.json());
  assert.equal(activity.items.length,1); assert.equal(activity.items[0].type,'buy'); assert.equal(activity.items[0].is_pump,1); assert.equal(activity.items[0].mint,MINT);
  const tokens=await fetch(base+'/api/tokens').then(x=>x.json());
  assert.equal(tokens.items.length,1); assert.equal(tokens.items[0].symbol,'$TST'); assert.equal(tokens.items[0].is_pump,1);
  const overview=await fetch(base+'/api/overview').then(x=>x.json());
  assert.ok(overview.feed.some(x=>x.title==='Bought $TST'));
  assert.equal(overview.stats.linkedWallets,1);
}));

test('invalid Solana wallet is rejected before monitoring',async()=>withServer(async base=>{
  const cookie=await registerOwner(base);
  const er=await authed(base,'/api/entities',cookie,{method:'POST',body:JSON.stringify({name:'Bad Wallet Test'})}); const entity=await er.json();
  const r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:'not-a-solana-wallet'})});
  assert.equal(r.status,400); const body=await r.json(); assert.match(body.error,/Invalid Solana/);
}));

test('v0.4 migration removes only known demo rows and preserves a real entity',async()=>{
  const { DatabaseSync } = await import('node:sqlite');
  const { openDb } = await import('../src/db.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'si-migrate-')); const dbPath=path.join(dir,'old.db');
  const old=new DatabaseSync(dbPath);
  old.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',avatar TEXT DEFAULT '',bio TEXT DEFAULT '',x_handle TEXT DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL);
    CREATE TABLE entities (id TEXT PRIMARY KEY,name TEXT NOT NULL,x_handle TEXT DEFAULT '',avatar TEXT DEFAULT '',avatar_source TEXT DEFAULT 'manual',risk_score INTEGER NOT NULL DEFAULT 0,confidence INTEGER NOT NULL DEFAULT 50,incidents INTEGER NOT NULL DEFAULT 0,follower_losses REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'watch',notes TEXT DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE wallets (id TEXT PRIMARY KEY,entity_id TEXT,address TEXT UNIQUE NOT NULL,label TEXT DEFAULT '',avatar TEXT DEFAULT '',avatar_source TEXT DEFAULT 'generated',chain TEXT NOT NULL DEFAULT 'solana',created_at TEXT NOT NULL);
    CREATE TABLE tokens (id TEXT PRIMARY KEY,symbol TEXT NOT NULL,name TEXT NOT NULL,mint TEXT UNIQUE,image TEXT DEFAULT '',price_change REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE incidents (id TEXT PRIMARY KEY,entity_id TEXT,wallet_id TEXT,token_id TEXT,type TEXT NOT NULL,title TEXT NOT NULL,detail TEXT DEFAULT '',severity TEXT NOT NULL DEFAULT 'info',value REAL,created_at TEXT NOT NULL);
    CREATE TABLE evidence (id TEXT PRIMARY KEY,user_id TEXT,entity_id TEXT,title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'note',source_url TEXT DEFAULT '',image TEXT DEFAULT '',note TEXT DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE copy_groups (id TEXT PRIMARY KEY,name TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'watch',enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE copy_group_wallets (group_id TEXT NOT NULL,wallet_id TEXT NOT NULL,PRIMARY KEY(group_id,wallet_id));
    CREATE TABLE chat_messages (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE direct_messages (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL,recipient_id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO settings VALUES ('demo_mode','true');
    INSERT INTO entities (id,name,created_at) VALUES ('ent_moon','moondev','2026-01-01T00:00:00Z');
    INSERT INTO entities (id,name,x_handle,confidence,notes,created_at) VALUES ('ent_real_sling','sling','@slingoorio',100,'real','2026-01-01T00:00:00Z');
    INSERT INTO wallets (id,entity_id,address,label,created_at) VALUES ('wal_real_sling','ent_real_sling','${WALLET}','Main wallet','2026-01-01T00:00:00Z');
  `); old.close();
  const db=openDb(dbPath);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM entities WHERE id='ent_moon'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM entities WHERE id='ent_real_sling'").get().n,1);
  assert.equal(db.prepare("SELECT address FROM wallets WHERE id='wal_real_sling'").get().address,WALLET);
  assert.equal(db.prepare("SELECT value FROM settings WHERE key='demo_mode'").get().value,'false');
  db.close(); fs.rmSync(dir,{recursive:true,force:true});
});

test('Helius SWAP event collapses intermediate transfer legs into one canonical trade',async()=>{
  const { getRecentWalletActivity } = await import('../src/adapters/solana-rpc.mjs');
  const old=process.env.HELIUS_API_KEY; process.env.HELIUS_API_KEY='test-key';
  const FLAPPY='8RecM2qen8YxnJiTCVqo5jzauCcD5UetTn9KzfJpump';
  const INTERMEDIATE='pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn';
  const heliusFetch=async input=>{
    const url=String(input);
    assert.match(url,/api\.helius\.xyz\/v0\/addresses\//);
    return response([{
      signature:'3spsY7L6b5A1example',slot:446006182,timestamp:1760000000,type:'SWAP',source:'JUPITER',description:'wallet swapped SOL for FLAPPY',
      nativeTransfers:[{fromUserAccount:WALLET,toUserAccount:'pool',amount:250000000}],
      tokenTransfers:[
        {fromUserAccount:'pool',toUserAccount:WALLET,mint:FLAPPY,tokenAmount:59564221.841908},
        {fromUserAccount:'route',toUserAccount:WALLET,mint:INTERMEDIATE,tokenAmount:1.409716787e-11}
      ],
      events:{swap:{
        nativeInput:{account:WALLET,amount:'250000000'},nativeOutput:null,
        tokenInputs:[],tokenOutputs:[{userAccount:WALLET,mint:FLAPPY,rawTokenAmount:{tokenAmount:'59564221841908',decimals:6}}],
        tokenFees:[],nativeFees:[],innerSwaps:[]
      }}
    }]);
  };
  try{
    const result=await getRecentWalletActivity(WALLET,{limit:20,fetchImpl:heliusFetch});
    assert.equal(result.provider,'helius');
    assert.equal(result.activity.length,1);
    assert.equal(result.activity[0].type,'buy');
    assert.equal(result.activity[0].mint,FLAPPY);
    assert.equal(result.activity[0].solAmount,-0.25);
  }finally{ if(old===undefined)delete process.env.HELIUS_API_KEY; else process.env.HELIUS_API_KEY=old; }
});

test('Helius generic token receive is not mislabeled as a buy because of SOL fees',async()=>{
  const { getRecentWalletActivity } = await import('../src/adapters/solana-rpc.mjs');
  const old=process.env.HELIUS_API_KEY; process.env.HELIUS_API_KEY='test-key';
  const DROP='7YgWwF9gW1QmUJsYdZgTK3wpdwxnoYpvy2Ypbo7Qpump';
  const heliusFetch=async()=>response([{
    signature:'airdrop-example',slot:9,timestamp:1760000001,type:'TRANSFER',source:'SYSTEM_PROGRAM',description:'token transfer',
    nativeTransfers:[{fromUserAccount:WALLET,toUserAccount:'fee',amount:5000}],
    tokenTransfers:[{fromUserAccount:'sender',toUserAccount:WALLET,mint:DROP,tokenAmount:10}],events:{}
  }]);
  try{
    const result=await getRecentWalletActivity(WALLET,{limit:20,fetchImpl:heliusFetch});
    assert.equal(result.activity.length,1);
    assert.equal(result.activity[0].type,'receive');
    assert.equal(result.activity[0].solAmount,0);
  }finally{ if(old===undefined)delete process.env.HELIUS_API_KEY; else process.env.HELIUS_API_KEY=old; }
});

test('v0.5 normalizer migration archives v0.4 activity and preserves real identity/evidence context',async()=>{
  const { openDb } = await import('../src/db.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'si-v05-migrate-')); const dbPath=path.join(dir,'old-v04.db');
  let db=openDb(dbPath);
  const entity='ent_keep', wallet='wal_keep', now='2026-09-10T23:13:33.000Z';
  db.prepare("INSERT INTO entities (id,name,x_handle,confidence,status,created_at) VALUES (?,?,?,?,?,?)").run(entity,'sling','@slingoorio',100,'monitoring',now);
  db.prepare("INSERT INTO wallets (id,entity_id,address,label,created_at,last_signature,sync_status) VALUES (?,?,?,?,?,?,?)").run(wallet,entity,WALLET,'Main wallet',now,'sig-old','live');
  const ins=db.prepare(`INSERT INTO wallet_activity (id,event_key,wallet_id,entity_id,signature,slot,block_time,type,source,description,mint,token_symbol,token_name,token_amount,sol_amount,price_usd,price_change,is_pump,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('a1','chain:'+wallet+':sig1:mint1:buy',wallet,entity,'sig1',1,now,'buy','JUPITER','raw leg','mint1','$FLAPPY','Flappy',100,0,0,0,1,now);
  ins.run('a2','chain:'+wallet+':sig1:mint2:buy',wallet,entity,'sig1',1,now,'buy','JUPITER','intermediate leg','mint2','$PUMP','Pump',1,0,0,0,1,now);
  db.prepare("INSERT INTO incidents (id,entity_id,wallet_id,type,title,severity,created_at,source_key) VALUES (?,?,?,?,?,?,?,?)").run('chain-old',entity,wallet,'buy','Bought raw','info',now,'chain:'+wallet+':sig1:mint1:buy');
  db.prepare("INSERT INTO incidents (id,entity_id,type,title,severity,created_at,source_key) VALUES (?,?,?,?,?,?,?)").run('social-keep',entity,'social','X post detected','info',now,'x:123');
  db.prepare("UPDATE settings SET value='false' WHERE key='activity_normalizer_v05'").run();
  db.close();
  db=openDb(dbPath);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM wallet_activity_v04_archive').get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM wallet_activity').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE id='chain-old'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE id='social-keep'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM entities WHERE id=?").get(entity).n,1);
  const w=db.prepare('SELECT last_signature,sync_status FROM wallets WHERE id=?').get(wallet);
  assert.equal(w.last_signature,''); assert.equal(w.sync_status,'pending');
  db.close(); fs.rmSync(dir,{recursive:true,force:true});
});
