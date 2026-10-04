/* SHADOW_REPLIT_ONLY_RUNTIME_V372 */
/* SHADOW_DELEGATED_COPY_ENGINE_V340
 * Non-custodial architecture.
 *
 * IMPORTANT:
 * - This module NEVER creates a user-funds private key.
 * - The user's funding wallet remains the owner.
 * - Shadow stores only a scoped session key. The on-chain policy program must
 *   enforce its expiry, BUY caps, SELL percentage, Jupiter-only execution and
 *   owner-only revoke/withdraw.
 * - Mainnet execution remains fail-closed until the operator explicitly sets
 *   SHADOW_DELEGATED_MAINNET_APPROVED=true after the deployed program has been
 *   independently audited/reviewed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT=path.resolve(__dirname,'..');
const DEFAULT_SBF_PATH=path.join(PROJECT_ROOT,'solana','shadow-delegated-vault','target','deploy','shadow_delegated_vault.so');

const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest();
const hashHex=v=>sha256(v).toString('hex');
const b64url=b=>Buffer.from(b).toString('base64url');
const discriminator=name=>sha256(`global:${name}`).subarray(0,8);
const INIT_DISC=discriminator('initialize_policy');
const REVOKE_DISC=discriminator('revoke_session');

function rpcUrl(){
  const direct=text(process.env.SOLANA_RPC_URL);
  if(/^https?:\/\//i.test(direct))return direct;
  const helius=text(process.env.HELIUS_API_KEY);
  if(helius)return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius)}`;
  return text(process.env.SHADOW_SOLANA_CLUSTER).toLowerCase()==='devnet'
    ?'https://api.devnet.solana.com'
    :'https://api.mainnet-beta.solana.com';
}
function clusterName(){
  const explicit=text(process.env.SHADOW_SOLANA_CLUSTER).toLowerCase();
  if(explicit==='devnet')return 'devnet';
  if(explicit==='mainnet'||explicit==='mainnet-beta')return 'mainnet-beta';
  return /devnet/i.test(rpcUrl())?'devnet':'mainnet-beta';
}
function parseSessionMasterKey(){
  const raw=text(process.env.SHADOW_SESSION_MASTER_KEY);
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
function programId(){
  const raw=text(process.env.SHADOW_DELEGATED_PROGRAM_ID);
  if(!raw)return null;
  try{return new PublicKey(raw)}catch{return null}
}
function delegatedArtifactStatus(){
  const configured=text(process.env.SHADOW_DELEGATED_SBF_PATH);
  const artifactPath=configured
    ?(path.isAbsolute(configured)?configured:path.resolve(PROJECT_ROOT,configured))
    :DEFAULT_SBF_PATH;
  try{
    const stat=fs.statSync(artifactPath);
    return {
      artifactPath,
      artifactPresent:stat.isFile()&&stat.size>0,
      artifactBytes:stat.isFile()?stat.size:0,
      artifactSource:'replit-local',
    };
  }catch{
    return {
      artifactPath,
      artifactPresent:false,
      artifactBytes:0,
      artifactSource:'replit-local',
    };
  }
}
function absUrl(path){
  const base=text(process.env.PUBLIC_BASE_URL)||text(process.env.REPLIT_DEPLOYMENT_URL)||text(process.env.REPLIT_DEV_DOMAIN);
  const normalized=base?(base.startsWith('http')?base:`https://${base}`):'';
  return normalized?new URL(path,normalized.endsWith('/')?normalized:`${normalized}/`).toString():path;
}
function u64(n){
  const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;
}
function i64(n){
  const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(n));return b;
}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(Number(n));return b}
function bool(v){return Buffer.from([v?1:0])}
function idHash(subscriptionId){return sha256(subscriptionId).subarray(0,32)}
function deriveAddresses(owner,subscriptionId,pid){
  const [policy]=PublicKey.findProgramAddressSync(
    [Buffer.from('policy'),owner.toBuffer(),idHash(subscriptionId)],pid
  );
  const [vault]=PublicKey.findProgramAddressSync(
    [Buffer.from('vault'),policy.toBuffer()],pid
  );
  return {policy,vault};
}
function ensureSchema(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS delegated_copy_sessions (
      subscription_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      funding_wallet_id TEXT NOT NULL,
      owner_address TEXT NOT NULL,
      session_public_key TEXT NOT NULL,
      encrypted_session_seed TEXT NOT NULL,
      seed_iv TEXT NOT NULL,
      seed_tag TEXT NOT NULL,
      policy_address TEXT NOT NULL,
      vault_address TEXT NOT NULL,
      program_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'authorization_required',
      authorized_at TEXT NOT NULL DEFAULT '',
      revoked_at TEXT NOT NULL DEFAULT '',
      auth_token_hash TEXT NOT NULL DEFAULT '',
      auth_token_expires_at TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_delegated_copy_user_entity
      ON delegated_copy_sessions(user_id,entity_id);
  `);
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
function mainWallet(db,entityId){
  return db.prepare(`SELECT * FROM wallets WHERE entity_id=?
    ORDER BY CASE WHEN lower(trim(COALESCE(label,'')))='main wallet' THEN 0 ELSE 1 END,created_at ASC LIMIT 1`).get(entityId)||null;
}
function sessionRow(db,subscriptionId){
  return db.prepare('SELECT * FROM delegated_copy_sessions WHERE subscription_id=?').get(subscriptionId)||null;
}
function publicSession(row){
  if(!row)return null;
  return {
    address:row.vault_address,
    kind:'noncustodial_delegated_vault',
    policyAddress:row.policy_address,
    sessionPublicKey:row.session_public_key,
    programId:row.program_id,
    authorizedAt:row.authorized_at||'',
    revokedAt:row.revoked_at||'',
  };
}

function buyMarketCapFilter(subscription={}) {
  const min=Math.max(0,Number(
    subscription.min_market_cap_usd ?? subscription.minMarketCapUsd ?? 0
  )||0);
  const rawMax=Number(
    subscription.max_market_cap_usd ?? subscription.maxMarketCapUsd ?? 0
  );
  const max=Number.isFinite(rawMax)&&rawMax>0?rawMax:0;
  return {
    enabled:min>0||max>0,
    minMarketCapUsd:min,
    maxMarketCapUsd:max,
    appliesTo:'buy',
    marketCapSource:'current_at_execution',
    unknownMarketCap:'skip',
    sellsBypass:true
  };
}

export function createInternalCopyEngine(db,{fetchImpl=fetch}={}){
  // Export name intentionally preserved for v3.3.x server compatibility.
  ensureSchema(db);
  const connection=new Connection(rpcUrl(),'confirmed');
  let lastError='';

  /* SHADOW_FAST_COPY_ENGINE_EVENT_V373 */
  let fastEventState={
    seen:0,
    lastEventAt:'',
    lastSignature:'',
    lastServerDispatchLagMs:0,
    lastDecisionMs:0,
    candidates:0,
    blockedByMarketCap:0,
    lastReason:''
  };

  /* SHADOW_COPY_LATENCY_METER_V380_ENGINE */
  const fastDecisionSamples=[];

  function decisionPercentile(values,p){
    if(!values.length)return 0;
    const sorted=[...values].sort((a,b)=>a-b);
    const index=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
    return Number(sorted[index]||0);
  }

  function recordDecisionLatency(value){
    const n=Math.max(0,Number(value)||0);
    fastDecisionSamples.push(n);
    if(fastDecisionSamples.length>100)fastDecisionSamples.shift();
  }

  function publicFastEvent(){
    return {
      ...fastEventState,
      sampleCount:fastDecisionSamples.length,
      p50DecisionMs:decisionPercentile(fastDecisionSamples,50),
      p95DecisionMs:decisionPercentile(fastDecisionSamples,95)
    };
  }
  /* SHADOW_COPY_LATENCY_METER_V380_ENGINE_END */

  function handleTradeEvent(event={}){
    const started=Date.now();
    const entityId=String(event.entityId||'');
    const side=String(event.side||'').toLowerCase()==='sell'?'sell':'buy';

    fastEventState.seen++;
    fastEventState.lastEventAt=now();
    fastEventState.lastSignature=String(event.signature||'');
    fastEventState.lastServerDispatchLagMs=Number(event.serverDispatchLagMs||0);

    if(!entityId){
      fastEventState.lastReason='missing_entity';
      fastEventState.lastDecisionMs=Date.now()-started;
      recordDecisionLatency(fastEventState.lastDecisionMs);
      return {accepted:false,reason:'missing_entity'};
    }

    const subscriptions=db.prepare(`
      SELECT *
      FROM copy_subscriptions
      WHERE entity_id=? AND enabled=1
      ORDER BY updated_at DESC
    `).all(entityId);

    let candidates=0;
    let blockedByMarketCap=0;

    for(const sub of subscriptions){
      if(side==='buy' && !sub.copy_buys)continue;
      if(side==='sell' && !sub.copy_sells)continue;

      if(side==='buy'){
        const min=Math.max(0,Number(sub.min_market_cap_usd||0));
        const max=Math.max(0,Number(sub.max_market_cap_usd||0));
        const rangeEnabled=min>0||max>0;

        if(rangeEnabled){
          const mc=Number(event.cachedMarketCapUsd||0);
          const age=Number(event.cachedMarketAgeMs);
          const fresh=mc>0 && Number.isFinite(age) && age<=5000;

          if(!fresh || (min>0&&mc<min) || (max>0&&mc>max)){
            blockedByMarketCap++;
            continue;
          }
        }
      }

      candidates++;
    }

    fastEventState.candidates=candidates;
    fastEventState.blockedByMarketCap=blockedByMarketCap;
    fastEventState.lastDecisionMs=Date.now()-started;
    recordDecisionLatency(fastEventState.lastDecisionMs);

    fastEventState.lastReason=candidates===0
      ? (blockedByMarketCap>0?'market_cap_filter':'no_active_subscription')
      : 'executor_security_gate';

    return {
      accepted:false,
      candidates,
      blockedByMarketCap,
      decisionMs:fastEventState.lastDecisionMs,
      executionAllowed:false,
      reason:fastEventState.lastReason
    };
  }
  /* SHADOW_FAST_COPY_ENGINE_EVENT_V373_END */

  function environmentStatus(){
    const pid=programId();
    const key=parseSessionMasterKey();
    const cluster=clusterName();
    const mainnetApproved=text(process.env.SHADOW_DELEGATED_MAINNET_APPROVED).toLowerCase()==='true';
    return {
      configured:!!pid&&!!key&&(cluster!=='mainnet-beta'||mainnetApproved),
      programConfigured:!!pid,
      sessionKeyEncryptionReady:!!key,
      cluster,
      mainnetApproved,
      programId:pid?.toBase58()||'',
      mode:'noncustodial_delegated_vault',
      ciRequired:false,
      buildTransport:'replit-local-artifact',
      artifactRequiredAtRuntime:false,
      ...delegatedArtifactStatus(),
      fastEvent:publicFastEvent(),
      lastError,
    };
  }
  function configBlockReason(){
    const s=environmentStatus();
    if(!s.programConfigured)return 'SHADOW_DELEGATED_PROGRAM_ID is not configured';
    if(!s.sessionKeyEncryptionReady)return 'SHADOW_SESSION_MASTER_KEY is not configured';
    if(s.cluster==='mainnet-beta'&&!s.mainnetApproved)return 'Delegated program is not approved for public mainnet execution yet';
    return '';
  }
  function ensureSession(subscription){
    let row=sessionRow(db,subscription.id);
    if(row)return row;
    const pid=programId();
    const master=parseSessionMasterKey();
    if(!pid||!master)return null;
    const owner=new PublicKey(subscription.funding_address||subscription.walletAddress);
    const session=Keypair.generate();
    const enc=encryptSeed(session.secretKey.subarray(0,32),master);
    const {policy,vault}=deriveAddresses(owner,subscription.id,pid);
    const at=now();
    db.prepare(`INSERT INTO delegated_copy_sessions
      (subscription_id,user_id,entity_id,funding_wallet_id,owner_address,session_public_key,
       encrypted_session_seed,seed_iv,seed_tag,policy_address,vault_address,program_id,state,
       authorized_at,revoked_at,auth_token_hash,auth_token_expires_at,last_error,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      subscription.id,subscription.user_id||subscription.userId,subscription.entity_id||subscription.entityId,
      subscription.user_wallet_id||subscription.userWalletId,owner.toBase58(),session.publicKey.toBase58(),
      enc.ciphertext,enc.iv,enc.tag,policy.toBase58(),vault.toBase58(),pid.toBase58(),'authorization_required',
      '','','','','',at,at
    );
    return sessionRow(db,subscription.id);
  }
  function issueActionUrl(row,action){
    const token=crypto.randomBytes(32).toString('base64url');
    const exp=new Date(Date.now()+30*60*1000).toISOString();
    const hash=hashHex(`${action}:${token}`);
    db.prepare(`UPDATE delegated_copy_sessions SET auth_token_hash=?,auth_token_expires_at=?,state=?,updated_at=? WHERE subscription_id=?`)
      .run(hash,exp,action==='revoke'?'revocation_required':'authorization_required',now(),row.subscription_id);
    return absUrl(`/execution-authorize.html?mode=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}`);
  }
  function actionRow(token,action,userId){
    const hash=hashHex(`${action}:${token}`);
    const row=db.prepare('SELECT * FROM delegated_copy_sessions WHERE auth_token_hash=?').get(hash);
    if(!row||row.user_id!==userId)return null;
    if(!row.auth_token_expires_at||Date.parse(row.auth_token_expires_at)<=Date.now())return null;
    return row;
  }
  async function onchainPolicyExists(row){
    try{
      const info=await connection.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
      return !!info&&info.owner.equals(new PublicKey(row.program_id));
    }catch(error){lastError=String(error?.message||error);return false}
  }
  async function snapshot(subscription,{issueToken=true}={}){
    const reason=configBlockReason();
    if(reason){
      const s=environmentStatus();
      const authorizationState=!s.programConfigured?'delegated_program_required':!s.sessionKeyEncryptionReady?'session_key_store_required':'mainnet_review_required';
      return {active:false,authorizationState,message:reason,environment:s,executionWallet:null};
    }
    const canonical=subRow(db,subscription.id)||subscription;
    let row=ensureSession(canonical);
    if(!row)return {active:false,authorizationState:'error',message:'Could not create delegated session metadata'};
    const exists=await onchainPolicyExists(row);
    if(exists&&!row.authorized_at){
      const at=now();
      db.prepare(`UPDATE delegated_copy_sessions SET authorized_at=?,revoked_at='',state='policy_active',updated_at=? WHERE subscription_id=?`).run(at,at,row.subscription_id);
      row=sessionRow(db,row.subscription_id);
    }
    let authUrl='';
    if(!exists&&issueToken)authUrl=issueActionUrl(row,'authorize');
    const policyActive=exists&&row.state==='policy_active'&&!row.revoked_at;
    // v3.4.0 deliberately does not claim autonomous execution readiness.
    // The on-chain policy can be created/revoked now, but the swap composer is
    // kept fail-closed until the final deployed program/IDL has passed review.
    const active=false;
    return {
      active,
      policyActive,
      authorizationState:policyActive?'policy_active_executor_locked':'authorization_required',
      authorizationUrl:authUrl,
      executionWallet:{
        ...publicSession(row),
        status:policyActive?'policy_active_executor_locked':'authorization_required',
        authorizationState:policyActive?'policy_active_executor_locked':'authorization_required',
        authorizationUrl:authUrl,
        custody:'user_owned_program_vault',
      },
      environment:environmentStatus(),
      buyMarketCapFilter:buyMarketCapFilter(canonical),
      executionReady:false,
      executionReadyReason:policyActive?'ONCHAIN_POLICY_ACTIVE_EXECUTOR_REVIEW_REQUIRED':'ONCHAIN_POLICY_NOT_ACTIVE',
    };
  }
  async function syncSubscription({action='upsert',subscription}={}){
    if(!subscription?.id)throw new Error('Subscription id is required');
    const canonical=subRow(db,subscription.id)||subscription;
    if(action==='revoke'||action==='disable'){
      const row=sessionRow(db,canonical.id);
      if(!row)return {active:false,authorizationState:'revoked',revoked:true};
      const url=issueActionUrl(row,'revoke');
      return {active:false,authorizationState:'revocation_required',revoked:false,revocationUrl:url,executionWallet:{...publicSession(row),status:'revocation_required',revocationUrl:url}};
    }
    return snapshot(canonical,{issueToken:true});
  }
  function authorizationDetails(token,userId,action='authorize'){
    const row=actionRow(token,action,userId);if(!row)return null;
    const sub=subRow(db,row.subscription_id);if(!sub)return null;
    const main=mainWallet(db,sub.entity_id);
    return {
      action,
      entityId:sub.entity_id,entityName:sub.entity_name||'',ownerAddress:row.owner_address,
      vaultAddress:row.vault_address,policyAddress:row.policy_address,sessionPublicKey:row.session_public_key,
      mainWallet:main?.address||'',amountSol:Number(sub.amount_sol||0),maxPositionSol:Number(sub.max_position_sol||0),
      maxDailySol:Number(sub.max_daily_sol||0),slippageBps:Number(sub.slippage_bps||0),
      minMarketCapUsd:Number(sub.min_market_cap_usd||0),maxMarketCapUsd:Number(sub.max_market_cap_usd||0),
      buyMarketCapFilter:buyMarketCapFilter(sub),copyBuys:!!sub.copy_buys,
      copySells:!!sub.copy_sells,sellPercent:Number(sub.sell_percent||100),expiresAt:row.auth_token_expires_at,
      cluster:clusterName(),programId:row.program_id,nonCustodial:true,
    };
  }
  async function prepareAction(token,userId,action='authorize'){
    const row=actionRow(token,action,userId);
    if(!row)throw Object.assign(new Error('Delegated authorization link is invalid or expired'),{statusCode:410});
    const sub=subRow(db,row.subscription_id);if(!sub)throw Object.assign(new Error('Copy subscription not found'),{statusCode:404});
    const pid=new PublicKey(row.program_id);
    const owner=new PublicKey(row.owner_address);
    const policy=new PublicKey(row.policy_address);
    const vault=new PublicKey(row.vault_address);
    const session=new PublicKey(row.session_public_key);
    const tx=new Transaction();
    if(action==='authorize'){
      const expiresAt=Math.floor(Date.now()/1000)+(30*24*60*60);
      const maxTradeLamports=BigInt(Math.max(0,Math.round(Number(sub.amount_sol||0)*1_000_000_000)));
      const dailyCapLamports=BigInt(Math.max(0,Math.round(Number(sub.max_daily_sol||0)*1_000_000_000)));
      const maxSellBps=Math.max(0,Math.min(10000,Math.round(Number(sub.sell_percent||100)*100)));
      const data=Buffer.concat([
        INIT_DISC,idHash(sub.id),session.toBuffer(),i64(expiresAt),u64(maxTradeLamports),u64(dailyCapLamports),u16(maxSellBps),bool(!!sub.copy_buys),bool(!!sub.copy_sells)
      ]);
      tx.add(new TransactionInstruction({
        programId:pid,
        keys:[
          {pubkey:owner,isSigner:true,isWritable:true},
          {pubkey:policy,isSigner:false,isWritable:true},
          {pubkey:vault,isSigner:false,isWritable:false},
          {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
        ],data,
      }));
    }else if(action==='revoke'){
      tx.add(new TransactionInstruction({
        programId:pid,
        keys:[{pubkey:owner,isSigner:true,isWritable:false},{pubkey:policy,isSigner:false,isWritable:true}],
        data:REVOKE_DISC,
      }));
    }else throw Object.assign(new Error('Unsupported delegated action'),{statusCode:400});
    tx.feePayer=owner;
    tx.recentBlockhash=(await connection.getLatestBlockhash('confirmed')).blockhash;
    return {
      action,
      transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),
      ownerAddress:row.owner_address,vaultAddress:row.vault_address,policyAddress:row.policy_address,
      sessionPublicKey:row.session_public_key,cluster:clusterName(),programId:row.program_id,
    };
  }
  async function confirmAction(token,userId,action='authorize',signature=''){
    const row=actionRow(token,action,userId);
    if(!row)throw Object.assign(new Error('Delegated action link is invalid or expired'),{statusCode:410});
    if(signature){
      const status=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});
      const s=status.value?.[0];
      if(s?.err)throw Object.assign(new Error(`On-chain transaction failed: ${JSON.stringify(s.err)}`),{statusCode:409});
    }
    const exists=await onchainPolicyExists(row);
    if(action==='authorize'&&!exists)throw Object.assign(new Error('Delegated policy account is not active on-chain yet'),{statusCode:409});
    const at=now();
    if(action==='authorize'){
      db.prepare(`UPDATE delegated_copy_sessions SET state='policy_active',authorized_at=?,revoked_at='',auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`).run(at,at,row.subscription_id);
      const sub=subRow(db,row.subscription_id);
      return snapshot(sub,{issueToken:false});
    }
    db.prepare(`UPDATE delegated_copy_sessions SET state='revoked',revoked_at=?,auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`).run(at,at,row.subscription_id);
    return {active:false,authorizationState:'revoked',revoked:true,executionWallet:{...publicSession(sessionRow(db,row.subscription_id)),status:'revoked'}};
  }
  function status(){return environmentStatus()}
  function start(){return status()}
  function stop(){return true}
  async function withdrawSol(){
    throw Object.assign(new Error('Non-custodial vault withdrawals require an owner-signed on-chain transaction; server-side withdrawal is disabled'),{statusCode:409,code:'OWNER_SIGNATURE_REQUIRED'});
  }
  return {status,start,stop,syncSubscription,authorizationDetails,prepareAction,confirmAction,withdrawSol,handleTradeEvent};
}
