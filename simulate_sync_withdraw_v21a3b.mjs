import fs from 'node:fs';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {
  Connection,PublicKey,Transaction,TransactionInstruction,SystemProgram
} from '@solana/web3.js';

const WSOL_MINT=new PublicKey('So11111111111111111111111111111111111111112');
const TOKEN_PROGRAM_ID=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const text=v=>String(v??'').trim();
const disc=name=>crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0,8);
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b};

function rpcUrl(){
  const direct=text(process.env.SOLANA_RPC_URL);
  if(/^https?:\/\//i.test(direct))return direct;
  const helius=text(process.env.HELIUS_API_KEY);
  if(helius)return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius)}`;
  return text(process.env.SHADOW_SOLANA_CLUSTER).toLowerCase()==='devnet'
    ?'https://api.devnet.solana.com'
    :'https://api.mainnet-beta.solana.com';
}
function ata(owner,mint){
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(),TOKEN_PROGRAM_ID.toBuffer(),mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}
function createAtaIdempotent(payer,owner,mint,account){
  return new TransactionInstruction({
    programId:ASSOCIATED_TOKEN_PROGRAM_ID,
    keys:[
      {pubkey:payer,isSigner:true,isWritable:true},
      {pubkey:account,isSigner:false,isWritable:true},
      {pubkey:owner,isSigner:false,isWritable:false},
      {pubkey:mint,isSigner:false,isWritable:false},
      {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
      {pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
    ],
    data:Buffer.from([1]),
  });
}
async function tokenRaw(connection,address){
  try{
    const r=await connection.getTokenAccountBalance(address,'confirmed');
    return BigInt(r.value.amount||'0');
  }catch{return 0n}
}
function programHasDisc(name){
  try{
    const b=fs.readFileSync('SYNC_DEPLOYED_PROGRAM_CURRENT.so');
    return b.indexOf(disc(name))>=0;
  }catch{return null}
}
async function rpcSimulate(serialized){
  const body={
    jsonrpc:'2.0',id:1,method:'simulateTransaction',
    params:[serialized.toString('base64'),{
      encoding:'base64',
      sigVerify:false,
      commitment:'confirmed',
      replaceRecentBlockhash:true
    }]
  };
  const r=await fetch(rpcUrl(),{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const j=await r.json();
  if(j.error)throw new Error(JSON.stringify(j.error));
  return j.result?.value||{};
}
function compactLogs(logs=[]){
  return logs.filter(x=>/Program log:|failed:|consumed|success/i.test(String(x)))
    .slice(-18).join('\n      ');
}

const pidText=text(process.env.SHADOW_DELEGATED_PROGRAM_ID);
if(!pidText)throw new Error('SHADOW_DELEGATED_PROGRAM_ID is not set');
const pid=new PublicKey(pidText);
const connection=new Connection(rpcUrl(),'confirmed');

const dbPath=process.env.DB_PATH||'./shadow-intelligence.db';
if(!fs.existsSync(dbPath))throw new Error(`Database not found: ${dbPath}`);
const db=new DatabaseSync(dbPath,{readOnly:true});
const rows=db.prepare(`
  SELECT d.*,e.x_handle,e.name AS entity_name
  FROM delegated_copy_sessions d
  LEFT JOIN entities e ON e.id=d.entity_id
  ORDER BY d.updated_at DESC
`).all();

console.log('=== SYNC WITHDRAW SIMULATOR V21A3B ===');
console.log('READ-ONLY: simulateTransaction only. NO transaction is broadcast.');
console.log(`Program ID: ${pid.toBase58()}`);
console.log(`withdraw_token discriminator: ${disc('withdraw_token').toString('hex')} binaryHit=${programHasDisc('withdraw_token')}`);
console.log(`withdraw_sol   discriminator: ${disc('withdraw_sol').toString('hex')} binaryHit=${programHasDisc('withdraw_sol')}`);
console.log('');

let chosen=null;
for(const row of rows){
  try{
    const policy=new PublicKey(row.policy_address);
    const vault=new PublicKey(row.vault_address);
    const owner=new PublicKey(row.owner_address);
    const source=ata(vault,WSOL_MINT);
    const [policyInfo,raw]=await Promise.all([
      connection.getAccountInfo(policy,'confirmed'),
      tokenRaw(connection,source)
    ]);
    if(policyInfo?.owner?.equals(pid) && raw>0n){
      chosen={row,policy,vault,owner,source,raw};
      break;
    }
  }catch{}
}
if(!chosen)throw new Error('No funded on-chain delegated vault found');

const {row,policy,vault,owner,source,raw}=chosen;
const destination=ata(owner,WSOL_MINT);
const destInfo=await connection.getAccountInfo(destination,'confirmed');
const amount=1n;

console.log('--- TARGET SESSION ---');
console.log(`Entity: ${row.x_handle||row.entity_name||row.entity_id}`);
console.log(`Subscription: ${row.subscription_id}`);
console.log(`Owner: ${owner.toBase58()}`);
console.log(`Policy: ${policy.toBase58()}`);
console.log(`Vault: ${vault.toBase58()}`);
console.log(`Vault WSOL ATA: ${source.toBase58()}`);
console.log(`Vault WSOL raw: ${raw}`);
console.log(`Owner WSOL ATA: ${destination.toBase58()}`);
console.log(`Owner WSOL ATA exists: ${!!destInfo}`);
console.log('');

const common={
  owner:{pubkey:owner,isSigner:true,isWritable:true},
  policy:{pubkey:policy,isSigner:false,isWritable:true},
  vault:{pubkey:vault,isSigner:false,isWritable:true},
  source:{pubkey:source,isSigner:false,isWritable:true},
  destination:{pubkey:destination,isSigner:false,isWritable:true},
  token:{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
  system:{pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
  mint:{pubkey:WSOL_MINT,isSigner:false,isWritable:false},
};

const layouts=[
  ['owner','policy','vault','source','destination','token'],
  ['owner','policy','vault','source','destination','mint','token'],
  ['owner','policy','source','destination','vault','token'],
  ['owner','vault','policy','source','destination','token'],
  ['policy','owner','vault','source','destination','token'],
  ['owner','policy','vault','source','destination','token','system'],
  ['owner','policy','vault','source','destination'],
];

const dataForms=[
  {label:'disc+u64(1)',data:Buffer.concat([disc('withdraw_token'),u64(amount)])},
  {label:'disc-only',data:disc('withdraw_token')},
];

console.log('--- WITHDRAW_TOKEN SIMULATIONS ---');
let match=null;
let index=0;
for(const layout of layouts){
  for(const form of dataForms){
    index++;
    const tx=new Transaction();
    if(!destInfo)tx.add(createAtaIdempotent(owner,owner,WSOL_MINT,destination));
    tx.add(new TransactionInstruction({
      programId:pid,
      keys:layout.map(k=>common[k]),
      data:form.data
    }));
    tx.feePayer=owner;
    tx.recentBlockhash=(await connection.getLatestBlockhash('confirmed')).blockhash;
    tx.addSignature(owner,Buffer.alloc(64));
    const rawTx=tx.serialize({requireAllSignatures:false,verifySignatures:false});
    let sim;
    try{sim=await rpcSimulate(rawTx)}
    catch(e){
      console.log(`[${index}] ${layout.join(' > ')} | ${form.label}`);
      console.log(`    RPC ERROR: ${e.message}`);
      continue;
    }
    const ok=!sim.err;
    console.log(`[${index}] ${layout.join(' > ')} | ${form.label}`);
    console.log(`    err=${JSON.stringify(sim.err)} units=${sim.unitsConsumed??''}`);
    if(sim.logs?.length)console.log(`    logs:\n      ${compactLogs(sim.logs)}`);
    if(ok && !match){
      match={layout,form};
      console.log('    >>> SIMULATION MATCH: instruction accepted <<<');
    }
  }
}

console.log('');
console.log('--- RESULT ---');
if(match){
  console.log(`MATCH layout: ${match.layout.join(' > ')}`);
  console.log(`MATCH data: ${match.form.label}`);
  console.log('This was simulation only. The real V21B can now use the confirmed account order/data shape.');
}else{
  console.log('No candidate produced a full success.');
  console.log('The error/log patterns above still identify which account/data constraint is next.');
}
console.log('');
console.log('NO transaction was sent.');
console.log('NO wallet signature was requested.');
console.log('NO funds moved.');
