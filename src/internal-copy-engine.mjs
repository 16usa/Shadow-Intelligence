/* SHADOW_INTERNAL_COPY_ENGINE_V330 */
import crypto from 'node:crypto';
import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

const WSOL='So11111111111111111111111111111111111111112';
const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const b64url=b=>Buffer.from(b).toString('base64url');
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

function parseMasterKey(){
  const raw=text(process.env.SHADOW_EXECUTION_MASTER_KEY);
  if(!raw)return null;
  let key=null;
  try{
    if(/^[0-9a-f]{64}$/i.test(raw))key=Buffer.from(raw,'hex');
    else key=Buffer.from(raw,'base64');
  }catch{}
  return key?.length===32?key:null;
}

function encryptSeed(seed,key){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const body=Buffer.concat([cipher.update(Buffer.from(seed)),cipher.final()]);
  return {ciphertext:body.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
function decryptSeed(row,key){
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(row.seed_iv,'base64'));
  decipher.setAuthTag(Buffer.from(row.seed_tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.encrypted_seed,'base64')),decipher.final()]);
}

function rpcUrl(){
  const direct=text(process.env.SOLANA_RPC_URL);
  if(/^https?:\/\//i.test(direct))return direct;
  const helius=text(process.env.HELIUS_API_KEY);
  if(helius)return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius)}`;
  return 'https://api.mainnet-beta.solana.com';
}
function jupiterBase(){
  return text(process.env.JUPITER_API_KEY)?'https://api.jup.ag':'https://lite-api.jup.ag';
}
function jupiterHeaders(extra={}){
  const h={accept:'application/json',...extra};
  const key=text(process.env.JUPITER_API_KEY);
  if(key)h['x-api-key']=key;
  return h;
}
function absUrl(path){
  const base=text(process.env.PUBLIC_BASE_URL)||text(process.env.REPLIT_DEPLOYMENT_URL)||text(process.env.REPLIT_DEV_DOMAIN);
  const normalized=base?(base.startsWith('http')?base:`https://${base}`):'';
  return normalized?new URL(path,normalized.endsWith('/')?normalized:`${normalized}/`).toString():path;
}

function ensureSchema(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS internal_copy_wallets (
      subscription_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      funding_wallet_id TEXT NOT NULL,
      address TEXT NOT NULL,
      encrypted_seed TEXT NOT NULL,
      seed_iv TEXT NOT NULL,
      seed_tag TEXT NOT NULL,
      authorized_at TEXT NOT NULL DEFAULT '',
      revoked_at TEXT NOT NULL DEFAULT '',
      auth_token_hash TEXT NOT NULL DEFAULT '',
      auth_token_expires_at TEXT NOT NULL DEFAULT '',
      auth_challenge TEXT NOT NULL DEFAULT '',
      auth_challenge_expires_at TEXT NOT NULL DEFAULT '',
      last_balance_lamports TEXT NOT NULL DEFAULT '0',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_copy_wallet_user_entity
      ON internal_copy_wallets(user_id,entity_id);

    CREATE TABLE IF NOT EXISTS internal_copy_execs (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      source_event_key TEXT NOT NULL,
      source_signature TEXT NOT NULL DEFAULT '',
      source_wallet_id TEXT NOT NULL DEFAULT '',
      side TEXT NOT NULL,
      mint TEXT NOT NULL,
      sol_value REAL NOT NULL DEFAULT 0,
      raw_input TEXT NOT NULL DEFAULT '',
      raw_output TEXT NOT NULL DEFAULT '',
      tx_signature TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(subscription_id,source_event_key)
    );
    CREATE INDEX IF NOT EXISTS idx_internal_copy_exec_status
      ON internal_copy_execs(status,updated_at);

    CREATE TABLE IF NOT EXISTS internal_copy_positions (
      subscription_id TEXT NOT NULL,
      mint TEXT NOT NULL,
      spent_sol REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(subscription_id,mint)
    );

    CREATE TABLE IF NOT EXISTS internal_copy_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function mainWallet(db,entityId){
  return db.prepare(`
    SELECT * FROM wallets WHERE entity_id=?
    ORDER BY CASE WHEN lower(trim(COALESCE(label,'')))='main wallet' THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1
  `).get(entityId)||null;
}
function subRow(db,subscriptionId){
  return db.prepare(`
    SELECT s.*,uw.address AS funding_address,uw.provider AS funding_provider,e.name AS entity_name
    FROM copy_subscriptions s
    JOIN user_wallets uw ON uw.id=s.user_wallet_id
    JOIN entities e ON e.id=s.entity_id
    WHERE s.id=?
  `).get(subscriptionId)||null;
}
function walletRow(db,subscriptionId){
  return db.prepare('SELECT * FROM internal_copy_wallets WHERE subscription_id=?').get(subscriptionId)||null;
}
function publicWallet(row){
  if(!row)return null;
  return {address:row.address,kind:'dedicated_keypair',authorizedAt:row.authorized_at||'',revokedAt:row.revoked_at||''};
}
function id(prefix){return `${prefix}${crypto.randomUUID().replaceAll('-','')}`}

export function createInternalCopyEngine(db,{fetchImpl=fetch}={}){
  ensureSchema(db);
  const connection=new Connection(rpcUrl(),'confirmed');
  let timer=null,running=false,initializedCursor=false,lastError='',lastTickAt='';

  function masterKeyStatus(){
    const key=parseMasterKey();
    return {ready:!!key,error:key?'':(process.env.SHADOW_EXECUTION_MASTER_KEY?'SHADOW_EXECUTION_MASTER_KEY must decode to exactly 32 bytes':'SHADOW_EXECUTION_MASTER_KEY is not configured')};
  }
  function keypairFor(row){
    const key=parseMasterKey();
    if(!key)throw new Error(masterKeyStatus().error);
    const seed=decryptSeed(row,key);
    if(seed.length!==32)throw new Error('Execution wallet seed is invalid');
    const kp=Keypair.fromSeed(Uint8Array.from(seed));
    if(kp.publicKey.toBase58()!==row.address)throw new Error('Execution wallet key/address mismatch');
    return kp;
  }
  function ensureWallet(subscription){
    let row=walletRow(db,subscription.id);
    if(row)return row;
    const key=parseMasterKey();
    if(!key)return null;
    const seed=crypto.randomBytes(32);
    const kp=Keypair.fromSeed(Uint8Array.from(seed));
    const enc=encryptSeed(seed,key);
    const at=now();
    db.prepare(`INSERT INTO internal_copy_wallets
      (subscription_id,user_id,entity_id,funding_wallet_id,address,encrypted_seed,seed_iv,seed_tag,
       authorized_at,revoked_at,auth_token_hash,auth_token_expires_at,auth_challenge,auth_challenge_expires_at,
       last_balance_lamports,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        subscription.id,subscription.user_id,subscription.entity_id,subscription.user_wallet_id,
        kp.publicKey.toBase58(),enc.ciphertext,enc.iv,enc.tag,'','', '', '', '', '', '0',at,at
      );
    row=walletRow(db,subscription.id);
    return row;
  }
  function createAuthToken(row){
    const token=crypto.randomBytes(32).toString('base64url');
    const exp=new Date(Date.now()+30*60*1000).toISOString();
    db.prepare(`UPDATE internal_copy_wallets SET auth_token_hash=?,auth_token_expires_at=?,auth_challenge='',auth_challenge_expires_at='',updated_at=? WHERE subscription_id=?`)
      .run(sha256(token),exp,now(),row.subscription_id);
    return {token,expiresAt:exp};
  }
  function tokenWallet(token){
    const hash=sha256(token);
    const row=db.prepare('SELECT * FROM internal_copy_wallets WHERE auth_token_hash=?').get(hash);
    if(!row)return null;
    if(!row.auth_token_expires_at||Date.parse(row.auth_token_expires_at)<=Date.now())return null;
    return row;
  }
  async function balanceLamports(address){
    const n=await connection.getBalance(new PublicKey(address),'confirmed');
    return BigInt(n||0);
  }
  async function refreshBalance(row){
    try{
      const balance=await balanceLamports(row.address);
      db.prepare('UPDATE internal_copy_wallets SET last_balance_lamports=?,updated_at=? WHERE subscription_id=?').run(String(balance),now(),row.subscription_id);
      return balance;
    }catch(error){
      lastError=String(error?.message||error);
      return BigInt(row.last_balance_lamports||0);
    }
  }
  function requiredFundingLamports(subscription){
    const buyLamports=subscription.copy_buys?Math.ceil(Number(subscription.amount_sol||0)*LAMPORTS_PER_SOL):0;
    return BigInt(Math.max(10_000_000,buyLamports+10_000_000));
  }
  function recentExecs(subscriptionId){
    return db.prepare(`SELECT side,mint,sol_value AS solValue,tx_signature AS txSignature,status,error,created_at AS createdAt
      FROM internal_copy_execs WHERE subscription_id=? ORDER BY created_at DESC LIMIT 8`).all(subscriptionId);
  }

  async function snapshot(subscription,{provision=true,issueToken=true}={}){
    const keyStatus=masterKeyStatus();
    if(!keyStatus.ready){
      return {active:false,authorizationState:'engine_key_required',message:keyStatus.error,masterKeyReady:false};
    }
    let row=walletRow(db,subscription.id);
    if(!row&&provision)row=ensureWallet(subscription);
    if(!row)return {active:false,authorizationState:'execution_wallet_required',masterKeyReady:true};
    const balance=await refreshBalance(row);
    const authorized=!!row.authorized_at&&!row.revoked_at;
    const required=requiredFundingLamports(subscription);
    let state=authorized?(balance>=required?'armed':'funding_required'):'authorization_required';
    let authUrl='';
    if(!authorized&&issueToken){
      const auth=createAuthToken(row);
      authUrl=absUrl(`/execution-authorize.html?token=${encodeURIComponent(auth.token)}`);
      row=walletRow(db,subscription.id);
    }
    return {
      active:state==='armed',
      authorizationState:state,
      authorizationUrl:authUrl,
      masterKeyReady:true,
      executionWallet:{
        address:row.address,
        kind:'dedicated_keypair',
        status:state,
        balanceLamports:String(balance),
        balanceSol:Number(balance)/LAMPORTS_PER_SOL,
        requiredFundingSol:Number(required)/LAMPORTS_PER_SOL,
        authorizedAt:row.authorized_at||''
      },
      recent:recentExecs(subscription.id)
    };
  }

  async function syncSubscription({action='upsert',subscription}={}){
    if(!subscription?.id)throw new Error('Subscription id is required');
    ensureSchema(db);
    const canonical=subRow(db,subscription.id)||subscription;
    if(action==='revoke'||action==='disable'){
      const row=walletRow(db,canonical.id);
      if(row){
        db.prepare(`UPDATE internal_copy_wallets SET authorized_at='',revoked_at=?,auth_token_hash='',auth_token_expires_at='',auth_challenge='',auth_challenge_expires_at='',updated_at=? WHERE subscription_id=?`)
          .run(now(),now(),canonical.id);
      }
      return {active:false,revoked:true,authorizationRevoked:true,authorizationState:'revoked',executionWallet:row?{...publicWallet(row),status:'revoked'}:null};
    }
    return snapshot(canonical,{provision:true,issueToken:true});
  }

  function authorizationDetails(token,userId){
    const row=tokenWallet(token);
    if(!row||row.user_id!==userId)return null;
    const sub=subRow(db,row.subscription_id);
    if(!sub)return null;
    const main=mainWallet(db,sub.entity_id);
    return {
      entityId:sub.entity_id,entityName:sub.entity_name||'',fundingAddress:sub.funding_address,
      executionAddress:row.address,mainWallet:main?.address||'',amountSol:Number(sub.amount_sol||0),
      maxPositionSol:Number(sub.max_position_sol||0),maxDailySol:Number(sub.max_daily_sol||0),
      slippageBps:Number(sub.slippage_bps||0),copyBuys:!!sub.copy_buys,copySells:!!sub.copy_sells,
      sellPercent:Number(sub.sell_percent||100),expiresAt:row.auth_token_expires_at
    };
  }
  function authorizationChallenge(token,userId){
    const row=tokenWallet(token);
    if(!row||row.user_id!==userId)throw Object.assign(new Error('Authorization link is invalid or expired'),{statusCode:410});
    const sub=subRow(db,row.subscription_id);
    if(!sub)throw Object.assign(new Error('Copy subscription not found'),{statusCode:404});
    const main=mainWallet(db,sub.entity_id);
    const expiresAt=new Date(Date.now()+5*60*1000).toISOString();
    const message=[
      'Shadow Intelligence 24/7 execution authorization',
      `Funding wallet: ${sub.funding_address}`,
      `Execution wallet: ${row.address}`,
      `Copy source Main Wallet: ${main?.address||'unknown'}`,
      `Trade size: ${Number(sub.amount_sol||0)} SOL`,
      `Max position: ${Number(sub.max_position_sol||0)} SOL`,
      `Daily cap: ${Number(sub.max_daily_sol||0)} SOL`,
      `Max slippage: ${Number(sub.slippage_bps||0)} bps`,
      `Copy buys: ${sub.copy_buys?'yes':'no'}`,
      `Copy sells: ${sub.copy_sells?'yes':'no'}`,
      `Sell amount: ${Number(sub.sell_percent||100)}%`,
      `Expires: ${expiresAt}`,
      '',
      'This authorizes automatic trades from the dedicated Execution Wallet only.',
      'It does not authorize Shadow to spend from the funding wallet.'
    ].join('\n');
    db.prepare('UPDATE internal_copy_wallets SET auth_challenge=?,auth_challenge_expires_at=?,updated_at=? WHERE subscription_id=?')
      .run(message,expiresAt,now(),row.subscription_id);
    return {message,expiresAt,fundingAddress:sub.funding_address,executionAddress:row.address};
  }
  function challengeRecord(token,userId){
    const row=tokenWallet(token);
    if(!row||row.user_id!==userId)return null;
    if(!row.auth_challenge||Date.parse(row.auth_challenge_expires_at||'')<=Date.now())return null;
    const sub=subRow(db,row.subscription_id);
    if(!sub)return null;
    return {row,subscription:sub,message:row.auth_challenge,fundingAddress:sub.funding_address};
  }
  async function authorize(token,userId){
    const row=tokenWallet(token);
    if(!row||row.user_id!==userId)throw Object.assign(new Error('Authorization link is invalid or expired'),{statusCode:410});
    const at=now();
    db.prepare(`UPDATE internal_copy_wallets SET authorized_at=?,revoked_at='',auth_token_hash='',auth_token_expires_at='',auth_challenge='',auth_challenge_expires_at='',updated_at=? WHERE subscription_id=?`)
      .run(at,at,row.subscription_id);
    const sub=subRow(db,row.subscription_id);
    return snapshot(sub,{provision:false,issueToken:false});
  }

  async function jupiterSwap({keypair,inputMint,outputMint,amount,slippageBps}){
    const qs=new URLSearchParams({inputMint,outputMint,amount:String(amount),slippageBps:String(clamp(Number(slippageBps)||500,10,3000)),swapMode:'ExactIn',instructionVersion:'V2'});
    const quoteRes=await fetchImpl(`${jupiterBase()}/swap/v1/quote?${qs}`,{headers:jupiterHeaders(),signal:AbortSignal.timeout(12000)});
    const quote=await quoteRes.json().catch(()=>({}));
    if(!quoteRes.ok||quote?.error)throw new Error(quote?.error||`Jupiter quote HTTP ${quoteRes.status}`);
    if(!(BigInt(quote?.outAmount||0)>0n))throw new Error('Jupiter returned no executable output amount');

    const swapRes=await fetchImpl(`${jupiterBase()}/swap/v1/swap`,{
      method:'POST',headers:jupiterHeaders({'content-type':'application/json'}),signal:AbortSignal.timeout(15000),
      body:JSON.stringify({
        userPublicKey:keypair.publicKey.toBase58(),quoteResponse:quote,wrapAndUnwrapSol:true,dynamicComputeUnitLimit:true,
        prioritizationFeeLamports:{priorityLevelWithMaxLamports:{priorityLevel:'high',maxLamports:1_000_000}}
      })
    });
    const swap=await swapRes.json().catch(()=>({}));
    if(!swapRes.ok||!swap?.swapTransaction)throw new Error(swap?.error||`Jupiter swap HTTP ${swapRes.status}`);

    const tx=VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction,'base64'));
    tx.sign([keypair]);
    const raw=Buffer.from(tx.serialize());
    const signature=await connection.sendRawTransaction(raw,{skipPreflight:false,maxRetries:3,preflightCommitment:'confirmed'});
    return {signature,quote,rawInput:String(quote.inAmount||amount),rawOutput:String(quote.outAmount||'')};
  }
  async function tokenRawBalance(owner,mint){
    const rows=await connection.getParsedTokenAccountsByOwner(new PublicKey(owner),{mint:new PublicKey(mint)},'confirmed');
    let raw=0n;
    for(const item of rows.value||[]){
      const amount=item.account?.data?.parsed?.info?.tokenAmount?.amount;
      if(amount!=null)raw+=BigInt(amount);
    }
    return raw;
  }
  async function confirmSignature(signature){
    const deadline=Date.now()+35000;
    while(Date.now()<deadline){
      const r=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});
      const s=r.value?.[0];
      if(s?.err)throw new Error(`Solana transaction failed: ${JSON.stringify(s.err)}`);
      if(s?.confirmationStatus==='confirmed'||s?.confirmationStatus==='finalized')return true;
      await sleep(1200);
    }
    return false;
  }
  function dailySpent(subscriptionId){
    const since=new Date();since.setUTCHours(0,0,0,0);
    return Number(db.prepare(`SELECT COALESCE(SUM(sol_value),0) AS n FROM internal_copy_execs
      WHERE subscription_id=? AND side='BUY' AND status IN ('preparing','submitted','confirmed') AND created_at>=?`).get(subscriptionId,since.toISOString())?.n||0);
  }
  function positionSpent(subscriptionId,mint){
    return Number(db.prepare('SELECT spent_sol FROM internal_copy_positions WHERE subscription_id=? AND mint=?').get(subscriptionId,mint)?.spent_sol||0);
  }
  function pendingBuySpent(subscriptionId,mint){
    return Number(db.prepare(`SELECT COALESCE(SUM(sol_value),0) AS n FROM internal_copy_execs WHERE subscription_id=? AND mint=? AND side='BUY' AND status IN ('preparing','submitted')`).get(subscriptionId,mint)?.n||0);
  }
  function updatePosition(subscriptionId,mint,next){
    const at=now();
    db.prepare(`INSERT INTO internal_copy_positions (subscription_id,mint,spent_sol,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(subscription_id,mint) DO UPDATE SET spent_sol=excluded.spent_sol,updated_at=excluded.updated_at`)
      .run(subscriptionId,mint,Math.max(0,next),at);
  }
  async function executeActivity(subscription,activity){
    const existing=db.prepare('SELECT id FROM internal_copy_execs WHERE subscription_id=? AND source_event_key=?').get(subscription.id,activity.event_key);
    if(existing)return {skipped:true,reason:'duplicate'};
    const wallet=walletRow(db,subscription.id);
    if(!wallet||!wallet.authorized_at||wallet.revoked_at)return {skipped:true,reason:'not-armed'};
    const keypair=keypairFor(wallet);
    const side=String(activity.type||'').toUpperCase();
    if(side==='BUY'&&!subscription.copy_buys)return {skipped:true,reason:'buys-disabled'};
    if(side==='SELL'&&!subscription.copy_sells)return {skipped:true,reason:'sells-disabled'};
    if(side!=='BUY'&&side!=='SELL')return {skipped:true,reason:'not-trade'};

    let inputMint,outputMint,amount,solValue=0;
    if(side==='BUY'){
      solValue=Number(subscription.amount_sol||0);
      if(!(solValue>0))return {skipped:true,reason:'zero-buy-size'};
      if(dailySpent(subscription.id)+solValue>Number(subscription.max_daily_sol||0)+1e-12)return {skipped:true,reason:'daily-cap'};
      if(positionSpent(subscription.id,activity.mint)+pendingBuySpent(subscription.id,activity.mint)+solValue>Number(subscription.max_position_sol||0)+1e-12)return {skipped:true,reason:'position-cap'};
      const balance=await balanceLamports(wallet.address);
      const lamports=BigInt(Math.round(solValue*LAMPORTS_PER_SOL));
      if(balance<lamports+10_000_000n)return {skipped:true,reason:'insufficient-sol'};
      inputMint=WSOL;outputMint=activity.mint;amount=lamports;
    }else{
      const pendingSell=db.prepare(`SELECT 1 FROM internal_copy_execs WHERE subscription_id=? AND mint=? AND side='SELL' AND status IN ('preparing','submitted') LIMIT 1`).get(subscription.id,activity.mint);
      if(pendingSell)return {skipped:true,reason:'pending-sell'};
      const balance=await tokenRawBalance(wallet.address,activity.mint);
      const pct=BigInt(Math.round(clamp(Number(subscription.sell_percent)||100,1,100)));
      amount=(balance*pct)/100n;
      if(amount<=0n)return {skipped:true,reason:'no-token-balance'};
      inputMint=activity.mint;outputMint=WSOL;
    }

    const execId=id('cxe_');const at=now();
    db.prepare(`INSERT INTO internal_copy_execs
      (id,subscription_id,source_event_key,source_signature,source_wallet_id,side,mint,sol_value,raw_input,raw_output,tx_signature,status,error,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(execId,subscription.id,activity.event_key,activity.signature||'',activity.wallet_id||'',side,activity.mint,solValue,String(amount),'','', 'preparing','',at,at);

    try{
      const swap=await jupiterSwap({keypair,inputMint,outputMint,amount,slippageBps:subscription.slippage_bps});
      db.prepare(`UPDATE internal_copy_execs SET tx_signature=?,raw_input=?,raw_output=?,status='submitted',updated_at=? WHERE id=?`)
        .run(swap.signature,swap.rawInput,swap.rawOutput,now(),execId);
      // Do not block the realtime copy loop waiting for confirmation. The submitted
      // transaction reserves caps immediately and is reconciled independently.
      return {ok:true,signature:swap.signature,submitted:true};
    }catch(error){
      db.prepare(`UPDATE internal_copy_execs SET status='error',error=?,updated_at=? WHERE id=?`).run(String(error?.message||error).slice(0,800),now(),execId);
      throw error;
    }
  }

  async function reconcileSubmitted(){
    const rows=db.prepare(`SELECT id,subscription_id,side,mint,sol_value,tx_signature FROM internal_copy_execs WHERE status='submitted' AND tx_signature<>'' ORDER BY updated_at LIMIT 20`).all();
    for(const row of rows){
      try{
        const s=(await connection.getSignatureStatuses([row.tx_signature],{searchTransactionHistory:true})).value?.[0];
        if(s?.err){
          db.prepare("UPDATE internal_copy_execs SET status='error',error=?,updated_at=? WHERE id=?").run(`Solana: ${JSON.stringify(s.err)}`,now(),row.id);
        }else if(s?.confirmationStatus==='confirmed'||s?.confirmationStatus==='finalized'){
          db.prepare("UPDATE internal_copy_execs SET status='confirmed',updated_at=? WHERE id=?").run(now(),row.id);
          if(row.side==='BUY')updatePosition(row.subscription_id,row.mint,positionSpent(row.subscription_id,row.mint)+Number(row.sol_value||0));
          else{
            const sub=subRow(db,row.subscription_id);
            const pct=clamp(Number(sub?.sell_percent)||100,1,100)/100;
            updatePosition(row.subscription_id,row.mint,positionSpent(row.subscription_id,row.mint)*(1-pct));
          }
        }
      }catch{}
    }
  }
  function currentMaxRowid(){return Number(db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM wallet_activity').get()?.n||0)}
  function cursor(){return Number(db.prepare("SELECT value FROM internal_copy_meta WHERE key='activity_cursor'").get()?.value||0)}
  function setCursor(n){db.prepare("INSERT INTO internal_copy_meta(key,value) VALUES('activity_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(n))}

  async function tick(){
    if(running)return;running=true;lastTickAt=now();
    try{
      if(!initializedCursor){
        const existing=cursor();
        if(!existing)setCursor(currentMaxRowid()); // Never replay old trades on first engine start.
        initializedCursor=true;
        return;
      }
      await reconcileSubmitted();
      const from=cursor();
      const rows=db.prepare(`SELECT rowid AS _rowid,* FROM wallet_activity WHERE rowid>? AND type IN ('buy','sell') AND is_pump=1 ORDER BY rowid LIMIT 100`).all(from);
      for(const activity of rows){
        try{
          const main=mainWallet(db,activity.entity_id);
          if(main?.id===activity.wallet_id){
            const subs=db.prepare('SELECT * FROM copy_subscriptions WHERE entity_id=? AND enabled=1 ORDER BY updated_at').all(activity.entity_id);
            for(const sub of subs){
              try{await executeActivity(sub,activity)}catch(error){lastError=String(error?.message||error)}
            }
          }
        }finally{setCursor(activity._rowid)}
      }
    }catch(error){lastError=String(error?.message||error)}finally{running=false}
  }
  function start(){
    if(timer)return;
    initializedCursor=false;
    timer=setInterval(()=>tick().catch(()=>{}),1000);
    timer.unref?.();
    timer.unref?.();
    setTimeout(()=>tick().catch(()=>{}),50).unref?.();
  }
  function stop(){if(timer){clearInterval(timer);timer=null}}

  async function withdrawSol(userId,entityId){
    const sub=db.prepare('SELECT * FROM copy_subscriptions WHERE user_id=? AND entity_id=?').get(userId,entityId);
    if(!sub)throw Object.assign(new Error('Copy subscription not found'),{statusCode:404});
    const wallet=walletRow(db,sub.id);
    if(!wallet)throw Object.assign(new Error('Execution Wallet not found'),{statusCode:404});
    const funding=db.prepare('SELECT * FROM user_wallets WHERE id=? AND user_id=?').get(sub.user_wallet_id,userId);
    if(!funding)throw Object.assign(new Error('Funding wallet not found'),{statusCode:404});
    const keypair=keypairFor(wallet);
    const balance=await balanceLamports(wallet.address);
    const reserve=5_000_000n;
    if(balance<=reserve)throw Object.assign(new Error('No withdrawable SOL balance'),{statusCode:409});
    const tx=new Transaction().add(SystemProgram.transfer({fromPubkey:keypair.publicKey,toPubkey:new PublicKey(funding.address),lamports:Number(balance-reserve)}));
    const sig=await connection.sendTransaction(tx,[keypair],{skipPreflight:false,maxRetries:3,preflightCommitment:'confirmed'});
    const confirmed=await confirmSignature(sig);
    return {ok:true,signature:sig,confirmed,to:funding.address,lamports:String(balance-reserve)};
  }

  function status(){
    const ks=masterKeyStatus();
    const provider=process.env.SOLANA_RPC_URL?'custom-rpc':process.env.HELIUS_API_KEY?'helius':'public-rpc';
    return {configured:true,masterKeyReady:ks.ready,masterKeyError:ks.error,rpcProvider:provider,jupiterProvider:process.env.JUPITER_API_KEY?'api.jup.ag':'lite-api.jup.ag',running:!!timer,lastTickAt,lastError};
  }

  return {start,stop,status,syncSubscription,authorizationDetails,authorizationChallenge,challengeRecord,authorize,withdrawSol,snapshot};
}
