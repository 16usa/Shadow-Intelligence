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
import { getPumpTokenMarketCap } from './adapters/token-market.mjs';
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
const UPDATE_DISC=discriminator('update_policy');
const EXECUTE_SWAP_DISC=discriminator('execute_swap');
const TOKEN_PROGRAM_ID=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const JUPITER_V6=new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
const WSOL_MINT=new PublicKey('So11111111111111111111111111111111111111112');

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
    CREATE TABLE IF NOT EXISTS delegated_copy_executions (
      subscription_id TEXT NOT NULL,
      source_signature TEXT NOT NULL,
      side TEXT NOT NULL,
      mint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      tx_signature TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(subscription_id,source_signature,side,mint)
    );
    CREATE INDEX IF NOT EXISTS idx_delegated_execution_updated
      ON delegated_copy_executions(updated_at DESC);
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
    marketCapSource:'pump.fun_live',
    unknownMarketCap:'skip',
    sellsBypass:true
  };
}


function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(Number(n));return b}
function base58Decode(value){
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const textValue=String(value||'');
  if(!textValue)return Buffer.alloc(0);
  let bytes=[0];
  for(const ch of textValue){
    const digit=alphabet.indexOf(ch);if(digit<0)throw new Error('Invalid base58');
    let carry=digit;
    for(let i=0;i<bytes.length;i++){const x=bytes[i]*58+carry;bytes[i]=x&255;carry=x>>8}
    while(carry){bytes.push(carry&255);carry>>=8}
  }
  for(let i=0;i<textValue.length-1&&textValue[i]==='1';i++)bytes.push(0);
  return Buffer.from(bytes.reverse());
}
function parseKeypairSecret(raw){
  const value=text(raw);if(!value)return null;
  let bytes=null;
  try{
    if(value.startsWith('['))bytes=Buffer.from(JSON.parse(value));
    else if(/^[1-9A-HJ-NP-Za-km-z]{80,120}$/.test(value))bytes=base58Decode(value);
    else bytes=Buffer.from(value,'base64');
  }catch{return null}
  try{
    if(bytes.length===64)return Keypair.fromSecretKey(new Uint8Array(bytes));
    if(bytes.length===32)return Keypair.fromSeed(new Uint8Array(bytes));
  }catch{}
  return null;
}
function executorFeePayer(){
  return parseKeypairSecret(process.env.SYNC_EXECUTOR_FEE_PAYER_KEY||process.env.SHADOW_EXECUTOR_FEE_PAYER_KEY||'');
}
function decryptSessionKeypair(row){
  const master=parseSessionMasterKey();if(!master)throw new Error('Session master key unavailable');
  const decipher=crypto.createDecipheriv('aes-256-gcm',master,Buffer.from(row.seed_iv,'base64'));
  decipher.setAuthTag(Buffer.from(row.seed_tag,'base64'));
  const seed=Buffer.concat([decipher.update(Buffer.from(row.encrypted_session_seed,'base64')),decipher.final()]);
  const kp=Keypair.fromSeed(new Uint8Array(seed.subarray(0,32)));
  if(kp.publicKey.toBase58()!==row.session_public_key)throw new Error('Delegated session key integrity check failed');
  return kp;
}
function ataAddress(owner,mint){
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(),TOKEN_PROGRAM_ID.toBuffer(),mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}
function createAtaIdempotentIx(payer,owner,mint,ata=ataAddress(owner,mint)){
  return new TransactionInstruction({
    programId:ASSOCIATED_TOKEN_PROGRAM_ID,
    keys:[
      {pubkey:payer,isSigner:true,isWritable:true},
      {pubkey:ata,isSigner:false,isWritable:true},
      {pubkey:owner,isSigner:false,isWritable:false},
      {pubkey:mint,isSigner:false,isWritable:false},
      {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
      {pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
    ],
    data:Buffer.from([1]),
  });
}
function syncNativeIx(account){
  return new TransactionInstruction({programId:TOKEN_PROGRAM_ID,keys:[{pubkey:account,isSigner:false,isWritable:true}],data:Buffer.from([17])});
}
function deserializeRemoteIx(payload){
  if(!payload)return null;
  return new TransactionInstruction({
    programId:new PublicKey(payload.programId),
    keys:(payload.accounts||[]).map(k=>({pubkey:new PublicKey(k.pubkey),isSigner:!!k.isSigner,isWritable:!!k.isWritable})),
    data:Buffer.from(payload.data||'','base64'),
  });
}
function parsePolicyData(data){
  const b=Buffer.from(data||[]);if(b.length<151)return null;
  let o=8;
  const owner=new PublicKey(b.subarray(o,o+=32)).toBase58();
  const sessionKey=new PublicKey(b.subarray(o,o+=32)).toBase58();
  const subscriptionHash=b.subarray(o,o+=32).toString('hex');
  const expiresAt=Number(b.readBigInt64LE(o));o+=8;
  const maxTradeLamports=b.readBigUInt64LE(o);o+=8;
  const dailyCapLamports=b.readBigUInt64LE(o);o+=8;
  const spentTodayLamports=b.readBigUInt64LE(o);o+=8;
  const dayIndex=Number(b.readBigInt64LE(o));o+=8;
  const maxSellBps=b.readUInt16LE(o);o+=2;
  const copyBuys=b[o++]!==0,copySells=b[o++]!==0,revoked=b[o++]!==0;
  const policyBump=b[o++],vaultBump=b[o++];
  return {owner,sessionKey,subscriptionHash,expiresAt,maxTradeLamports,dailyCapLamports,spentTodayLamports,dayIndex,maxSellBps,copyBuys,copySells,revoked,policyBump,vaultBump};
}
function desiredPolicy(subscription){
  return {
    maxTradeLamports:BigInt(Math.max(1,Math.round(Number(subscription.amount_sol||subscription.amountSol||0)*1_000_000_000))),
    dailyCapLamports:BigInt(Math.max(1,Math.round(Number(subscription.max_daily_sol||subscription.maxDailySol||0)*1_000_000_000))),
    maxSellBps:Math.max(0,Math.min(10000,Math.round(Number(subscription.sell_percent||subscription.sellPercent||100)*100))),
    copyBuys:subscription.copy_buys!=null?!!subscription.copy_buys:subscription.copyBuys!==false,
    copySells:subscription.copy_sells!=null?!!subscription.copy_sells:subscription.copySells!==false,
  };
}
function policyMatches(policy,subscription,row){
  if(!policy||policy.revoked)return false;
  const d=desiredPolicy(subscription);
  return policy.sessionKey===row.session_public_key &&
    policy.maxTradeLamports===d.maxTradeLamports &&
    policy.dailyCapLamports===d.dailyCapLamports &&
    policy.maxSellBps===d.maxSellBps &&
    policy.copyBuys===d.copyBuys && policy.copySells===d.copySells &&
    policy.expiresAt>Math.floor(Date.now()/1000)+300;
}
function jupiterBase(){return text(process.env.JUPITER_API_BASE)||'https://api.jup.ag'}
function jupiterHeaders(){
  const h={accept:'application/json','content-type':'application/json'};
  const key=text(process.env.JUPITER_API_KEY);if(key)h['x-api-key']=key;return h;
}
function jupiterConfigured(){return !!text(process.env.JUPITER_API_KEY)}
function mainnetApproved(){return ['true','1','yes'].includes(text(process.env.SYNC_DELEGATED_MAINNET_APPROVED||process.env.SHADOW_DELEGATED_MAINNET_APPROVED).toLowerCase())}

export function createInternalCopyEngine(db,{fetchImpl=fetch}={}){
  // Export name intentionally preserved for v3.3.x server compatibility.
  ensureSchema(db);
  const connection=new Connection(rpcUrl(),'confirmed');
  let lastError='';

  let executionChain=Promise.resolve();
  function enqueueExecution(task){
    const run=executionChain.then(task,task);
    executionChain=run.catch(()=>{});
    return run;
  }
  async function policyState(row){
    try{
      const info=await connection.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
      if(!info||!info.owner.equals(new PublicKey(row.program_id)))return null;
      return parsePolicyData(info.data);
    }catch(error){lastError=String(error?.message||error);return null}
  }
  async function tokenRawBalance(address){
    try{return BigInt((await connection.getTokenAccountBalance(address,'confirmed')).value.amount||'0')}catch{return 0n}
  }
  async function ensureAta(owner,mint,payer){
    const ata=ataAddress(owner,mint);
    if(await connection.getAccountInfo(ata,'confirmed'))return ata;
    const tx=new Transaction().add(createAtaIdempotentIx(payer.publicKey,owner,mint,ata));
    tx.feePayer=payer.publicKey;
    const latest=await connection.getLatestBlockhash('confirmed');tx.recentBlockhash=latest.blockhash;tx.sign(payer);
    const sig=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
    await connection.confirmTransaction({signature:sig,...latest},'confirmed');
    return ata;
  }
  async function jupiterQuote(inputMint,outputMint,amount,slippageBps){
    const url=new URL('/swap/v1/quote',jupiterBase());
    url.searchParams.set('inputMint',inputMint.toBase58());
    url.searchParams.set('outputMint',outputMint.toBase58());
    url.searchParams.set('amount',String(amount));
    url.searchParams.set('slippageBps',String(Math.max(10,Math.min(3000,Number(slippageBps)||500))));
    url.searchParams.set('restrictIntermediateTokens','true');
    url.searchParams.set('onlyDirectRoutes',text(process.env.SYNC_JUPITER_DIRECT_ONLY||'true').toLowerCase()==='true'?'true':'false');
    url.searchParams.set('maxAccounts',String(Math.max(16,Math.min(40,Number(process.env.SYNC_JUPITER_MAX_ACCOUNTS)||28))));
    url.searchParams.set('asLegacyTransaction','true');
    const response=await fetchImpl(url,{headers:jupiterHeaders(),signal:AbortSignal.timeout(5000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.error)throw new Error(data.error||`Jupiter quote HTTP ${response.status}`);
    if(!Array.isArray(data.routePlan)||!data.routePlan.length)throw new Error('Jupiter returned no route');
    return data;
  }
  async function jupiterInstructions(quote,vault,destination,payer){
    const url=new URL('/swap/v1/swap-instructions',jupiterBase());
    const maxPriority=Math.max(0,Math.min(2_000_000,Number(process.env.SYNC_MAX_PRIORITY_FEE_LAMPORTS)||500_000));
    const response=await fetchImpl(url,{
      method:'POST',headers:jupiterHeaders(),signal:AbortSignal.timeout(7000),
      body:JSON.stringify({
        quoteResponse:quote,
        userPublicKey:vault.toBase58(),
        payer:payer.publicKey.toBase58(),
        wrapAndUnwrapSol:false,
        destinationTokenAccount:destination.toBase58(),
        asLegacyTransaction:true,
        dynamicComputeUnitLimit:true,
        prioritizationFeeLamports:{priorityLevelWithMaxLamports:{priorityLevel:'high',maxLamports:maxPriority}}
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.error)throw new Error(data.error||`Jupiter instructions HTTP ${response.status}`);
    if(!data.swapInstruction)throw new Error('Jupiter did not return swapInstruction');
    return data;
  }
  function safeSetupInstruction(ix,vault,payer){
    if(!ix)return true;
    for(const k of ix.keys||[]){
      if(k.isSigner && !k.pubkey.equals(payer.publicKey))return false;
      if(k.isSigner && k.pubkey.equals(vault))return false;
    }
    return true;
  }
  async function executeCopyTrade(subscription,event){
    const canonical=subRow(db,subscription.id)||subscription;
    const row=sessionRow(db,canonical.id);if(!row)throw new Error('Delegated session missing');
    const policy=await policyState(row);if(!policy||!policyMatches(policy,canonical,row))throw new Error('Delegated policy is not active for current settings');
    if(clusterName()==='mainnet-beta'&&!mainnetApproved())throw new Error('Mainnet execution approval is off');
    if(!jupiterConfigured())throw new Error('JUPITER_API_KEY is not configured');
    const payer=executorFeePayer();if(!payer)throw new Error('SYNC_EXECUTOR_FEE_PAYER_KEY is not configured');
    const payerLamports=await connection.getBalance(payer.publicKey,'confirmed');
    if(payerLamports<2_000_000)throw new Error('Executor fee payer needs SOL for fees/rent');
    const session=decryptSessionKeypair(row);
    const vault=new PublicKey(row.vault_address);
    const mint=new PublicKey(String(event.mint||''));
    const side=String(event.side||'').toLowerCase()==='sell'?'sell':'buy';
    const inputMint=side==='buy'?WSOL_MINT:mint;
    const outputMint=side==='buy'?mint:WSOL_MINT;
    const source=ataAddress(vault,inputMint);
    const destination=await ensureAta(vault,outputMint,payer);
    const sourceBalance=await tokenRawBalance(source);
    let amount=0n;
    if(side==='buy'){
      amount=BigInt(Math.max(1,Math.round(Number(canonical.amount_sol||0)*1_000_000_000)));
      if(sourceBalance<amount)throw new Error('Delegated vault has insufficient WSOL for BUY');
    }else{
      const sellPercent=Math.max(1,Math.min(100,Number(canonical.sell_percent||100)));
      amount=(sourceBalance*BigInt(Math.round(sellPercent*100)))/10000n;
      if(amount<=0n)throw new Error('No delegated token balance to sell');
    }
    const quote=await jupiterQuote(inputMint,outputMint,amount,canonical.slippage_bps||500);
    const built=await jupiterInstructions(quote,vault,destination,payer);
    const swapIx=deserializeRemoteIx(built.swapInstruction);
    if(!swapIx.programId.equals(JUPITER_V6))throw new Error('Unexpected Jupiter program id');
    const setup=[...(built.computeBudgetInstructions||[]),...(built.setupInstructions||[])].map(deserializeRemoteIx).filter(Boolean);
    for(const ix of setup)if(!safeSetupInstruction(ix,vault,payer))throw new Error('Unsafe Jupiter setup signer requirement');
    const cleanup=deserializeRemoteIx(built.cleanupInstruction);
    if(cleanup&&!safeSetupInstruction(cleanup,vault,payer))throw new Error('Unsafe Jupiter cleanup signer requirement');
    const jupiterData=swapIx.data;
    const executeData=Buffer.concat([EXECUTE_SWAP_DISC,Buffer.from([side==='buy'?0:1]),u64(amount),u32(jupiterData.length),jupiterData]);
    const executeIx=new TransactionInstruction({
      programId:new PublicKey(row.program_id),
      keys:[
        {pubkey:session.publicKey,isSigner:true,isWritable:false},
        {pubkey:new PublicKey(row.policy_address),isSigner:false,isWritable:true},
        {pubkey:vault,isSigner:false,isWritable:false},
        {pubkey:source,isSigner:false,isWritable:true},
        {pubkey:destination,isSigner:false,isWritable:true},
        {pubkey:JUPITER_V6,isSigner:false,isWritable:false},
        ...swapIx.keys,
      ],
      data:executeData,
    });
    const tx=new Transaction();setup.forEach(ix=>tx.add(ix));tx.add(executeIx);if(cleanup)tx.add(cleanup);
    tx.feePayer=payer.publicKey;
    const latest=await connection.getLatestBlockhash('confirmed');tx.recentBlockhash=latest.blockhash;
    tx.sign(payer,session);
    const raw=tx.serialize();
    if(raw.length>1232)throw new Error(`Composed copy transaction is too large (${raw.length} bytes); lower SYNC_JUPITER_MAX_ACCOUNTS`);
    const signature=await connection.sendRawTransaction(raw,{skipPreflight:false,maxRetries:4});
    await connection.confirmTransaction({signature,...latest},'confirmed');
    return {signature,side,amount:String(amount),quoteOutAmount:String(quote.outAmount||'')};
  }
  async function runExecution(subscription,event){
    const sig=String(event.signature||`slot-${event.slot||0}`),side=String(event.side||'').toLowerCase()==='sell'?'sell':'buy',mint=String(event.mint||'');
    const stamp=now();
    const inserted=db.prepare(`INSERT OR IGNORE INTO delegated_copy_executions
      (subscription_id,source_signature,side,mint,status,tx_signature,last_error,created_at,updated_at)
      VALUES (?,?,?,?, 'queued','','',?,?)`).run(subscription.id,sig,side,mint,stamp,stamp);
    if(!inserted.changes)return {duplicate:true};
    db.prepare(`UPDATE delegated_copy_executions SET status='executing',updated_at=? WHERE subscription_id=? AND source_signature=? AND side=? AND mint=?`).run(now(),subscription.id,sig,side,mint);
    try{
      const result=await executeCopyTrade(subscription,event);
      db.prepare(`UPDATE delegated_copy_executions SET status='confirmed',tx_signature=?,last_error='',updated_at=? WHERE subscription_id=? AND source_signature=? AND side=? AND mint=?`).run(result.signature,now(),subscription.id,sig,side,mint);
      return result;
    }catch(error){
      db.prepare(`UPDATE delegated_copy_executions SET status='error',last_error=?,updated_at=? WHERE subscription_id=? AND source_signature=? AND side=? AND mint=?`).run(String(error.message||error).slice(0,500),now(),subscription.id,sig,side,mint);
      throw error;
    }
  }


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

  async function handleTradeEvent(event={}){
    const started=Date.now();
    const entityId=String(event.entityId||'');
    const side=String(event.side||'').toLowerCase()==='sell'?'sell':'buy';
    fastEventState.seen++;
    fastEventState.lastEventAt=now();
    fastEventState.lastSignature=String(event.signature||'');
    fastEventState.lastServerDispatchLagMs=Number(event.serverDispatchLagMs||0);
    if(!entityId){fastEventState.lastReason='missing_entity';fastEventState.lastDecisionMs=Date.now()-started;recordDecisionLatency(fastEventState.lastDecisionMs);return {accepted:false,reason:'missing_entity'}}
    const subscriptions=db.prepare(`SELECT * FROM copy_subscriptions WHERE entity_id=? AND enabled=1 ORDER BY updated_at DESC`).all(entityId);
    const marketCapRequired=side==='buy'&&subscriptions.some(sub=>{
      if(!sub.copy_buys)return false;const min=Math.max(0,Number(sub.min_market_cap_usd||0));const max=Math.max(0,Number(sub.max_market_cap_usd||0));return min>0||max>0;
    });
    let pumpMarketCapUsd=null;
    if(marketCapRequired){
      pumpMarketCapUsd=await getPumpTokenMarketCap(String(event.mint||''),{fetchImpl,maxAgeMs:750,timeoutMs:1800});
      if(Number.isFinite(Number(pumpMarketCapUsd))&&Number(pumpMarketCapUsd)>0){db.prepare(`UPDATE tokens SET market_cap=?,last_market_at=? WHERE mint=?`).run(Number(pumpMarketCapUsd),now(),String(event.mint||''))}
    }
    const ready=[];let blockedByMarketCap=0;
    for(const sub of subscriptions){
      if(side==='buy'&&!sub.copy_buys)continue;if(side==='sell'&&!sub.copy_sells)continue;
      if(side==='buy'){
        const min=Math.max(0,Number(sub.min_market_cap_usd||0));const max=Math.max(0,Number(sub.max_market_cap_usd||0));
        if(min>0||max>0){const mc=Number(pumpMarketCapUsd||0);if(!(mc>0)||(min>0&&mc<min)||(max>0&&mc>max)){blockedByMarketCap++;continue}}
      }
      ready.push(sub);
    }
    for(const sub of ready){enqueueExecution(()=>runExecution(sub,event)).catch(error=>{lastError=String(error?.message||error);console.warn('24/7 copy execution failed:',lastError)})}
    fastEventState.candidates=ready.length;fastEventState.blockedByMarketCap=blockedByMarketCap;fastEventState.lastDecisionMs=Date.now()-started;recordDecisionLatency(fastEventState.lastDecisionMs);
    fastEventState.lastReason=ready.length?'queued_24x7':(blockedByMarketCap?'market_cap_filter':'no_active_subscription');
    return {accepted:ready.length>0,candidates:ready.length,blockedByMarketCap,decisionMs:fastEventState.lastDecisionMs,executionAllowed:ready.length>0,reason:fastEventState.lastReason};
  }
  /* SHADOW_FAST_COPY_ENGINE_EVENT_V373_END */

  function environmentStatus(){
    const pid=programId();
    const key=parseSessionMasterKey();
    const cluster=clusterName();
    const approved=mainnetApproved();
    const payer=executorFeePayer();
    return {
      configured:!!pid&&!!key&&!!payer&&jupiterConfigured()&&(cluster!=='mainnet-beta'||approved),
      programConfigured:!!pid,
      sessionKeyEncryptionReady:!!key,
      cluster,
      mainnetApproved:approved,
      jupiterConfigured:jupiterConfigured(),
      executorFeePayerConfigured:!!payer,
      executorFeePayerAddress:payer?.publicKey.toBase58()||'',
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
    if(!s.executorFeePayerConfigured)return 'SYNC_EXECUTOR_FEE_PAYER_KEY is not configured';
    if(!s.jupiterConfigured)return 'JUPITER_API_KEY is not configured';
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
    const canonical=subRow(db,subscription.id)||subscription;
    const pid=programId(),master=parseSessionMasterKey();
    if(!pid||!master){
      const s=environmentStatus();
      return {active:false,authorizationState:!pid?'delegated_program_required':'session_key_store_required',message:!pid?'SHADOW_DELEGATED_PROGRAM_ID is not configured':'SHADOW_SESSION_MASTER_KEY is not configured',environment:s,executionWallet:null};
    }
    let row=ensureSession(canonical);if(!row)return {active:false,authorizationState:'error',message:'Could not create delegated session metadata'};
    const policy=await policyState(row);
    const exists=!!policy;
    if(exists&&!row.authorized_at){const at=now();db.prepare(`UPDATE delegated_copy_sessions SET authorized_at=?,revoked_at='',state='policy_active',updated_at=? WHERE subscription_id=?`).run(at,at,row.subscription_id);row=sessionRow(db,row.subscription_id)}
    const matches=exists&&policyMatches(policy,canonical,row);
    const vault=new PublicKey(row.vault_address),wsolAta=ataAddress(vault,WSOL_MINT);
    const vaultWsol=await tokenRawBalance(wsolAta);
    const minTrade=desiredPolicy(canonical).maxTradeLamports;
    const env=environmentStatus();
    const infraReady=env.executorFeePayerConfigured&&env.jupiterConfigured&&(env.cluster!=='mainnet-beta'||env.mainnetApproved);
    const funded=vaultWsol>=minTrade;
    let authUrl='';
    if((!exists||!matches||!funded)&&issueToken)authUrl=issueActionUrl(row,'authorize');
    const active=exists&&matches&&funded&&infraReady;
    const state=!exists?'authorization_required':!matches?'policy_update_required':!funded?'funding_required':!infraReady?'executor_configuration_required':'active';
    if(active&&row.state!=='active')db.prepare(`UPDATE delegated_copy_sessions SET state='active',last_error='',updated_at=? WHERE subscription_id=?`).run(now(),row.subscription_id);
    return {
      active,policyActive:exists&&!policy?.revoked,authorizationState:state,authorizationUrl:authUrl,
      executionWallet:{...publicSession(row),status:state,authorizationState:state,authorizationUrl:authUrl,custody:'user_owned_program_vault',wsolAta:wsolAta.toBase58(),wsolBalanceLamports:String(vaultWsol)},
      environment:env,buyMarketCapFilter:buyMarketCapFilter(canonical),executionReady:active,
      executionReadyReason:active?'READY_24X7':state.toUpperCase(),
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
      cluster:clusterName(),programId:row.program_id,nonCustodial:true,delegationDays:Math.max(1,Math.min(365,Number(process.env.SYNC_DELEGATION_DAYS)||30)),vaultFundingSol:Number(sub.max_position_sol||0),
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
      const days=Math.max(1,Math.min(365,Number(process.env.SYNC_DELEGATION_DAYS)||30));
      const expiresAt=Math.floor(Date.now()/1000)+(days*24*60*60);
      const d=desiredPolicy(sub);
      const exists=await onchainPolicyExists(row);
      if(!exists){
        const data=Buffer.concat([INIT_DISC,idHash(sub.id),session.toBuffer(),i64(expiresAt),u64(d.maxTradeLamports),u64(d.dailyCapLamports),u16(d.maxSellBps),bool(d.copyBuys),bool(d.copySells)]);
        tx.add(new TransactionInstruction({programId:pid,keys:[{pubkey:owner,isSigner:true,isWritable:true},{pubkey:policy,isSigner:false,isWritable:true},{pubkey:vault,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],data}));
      }else{
        const data=Buffer.concat([UPDATE_DISC,i64(expiresAt),u64(d.maxTradeLamports),u64(d.dailyCapLamports),u16(d.maxSellBps),bool(d.copyBuys),bool(d.copySells)]);
        tx.add(new TransactionInstruction({programId:pid,keys:[{pubkey:owner,isSigner:true,isWritable:false},{pubkey:policy,isSigner:false,isWritable:true}],data}));
      }
      const wsolAta=ataAddress(vault,WSOL_MINT);
      const current=await tokenRawBalance(wsolAta);
      const target=BigInt(Math.max(0,Math.round(Number(sub.max_position_sol||0)*1_000_000_000)));
      if(!(await connection.getAccountInfo(wsolAta,'confirmed')))tx.add(createAtaIdempotentIx(owner,vault,WSOL_MINT,wsolAta));
      if(target>current){const topUp=target-current;tx.add(SystemProgram.transfer({fromPubkey:owner,toPubkey:wsolAta,lamports:Number(topUp)}));tx.add(syncNativeIx(wsolAta));}
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
    const row=actionRow(token,action,userId);if(!row)throw Object.assign(new Error('Delegated action link is invalid or expired'),{statusCode:410});
    if(signature){const status=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});const s=status.value?.[0];if(s?.err)throw Object.assign(new Error(`On-chain transaction failed: ${JSON.stringify(s.err)}`),{statusCode:409})}
    const exists=await onchainPolicyExists(row);
    if(action==='authorize'&&!exists)throw Object.assign(new Error('Delegated policy account is not active on-chain yet'),{statusCode:409});
    const at=now();
    if(action==='authorize'){
      db.prepare(`UPDATE delegated_copy_sessions SET state='policy_active',authorized_at=?,revoked_at='',auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`).run(at,at,row.subscription_id);
      const sub=subRow(db,row.subscription_id);const result=await snapshot(sub,{issueToken:false});
      db.prepare(`UPDATE copy_subscriptions SET enabled=?,engine_state=?,last_error=?,updated_at=? WHERE id=?`).run(result.active?1:0,result.active?'active':String(result.authorizationState||'pending'),result.active?'':String(result.executionReadyReason||''),at,row.subscription_id);
      return result;
    }
    db.prepare(`UPDATE delegated_copy_sessions SET state='revoked',revoked_at=?,auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`).run(at,at,row.subscription_id);
    db.prepare(`UPDATE copy_subscriptions SET enabled=0,engine_state='stopped',last_error='',updated_at=? WHERE id=?`).run(at,row.subscription_id);
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
