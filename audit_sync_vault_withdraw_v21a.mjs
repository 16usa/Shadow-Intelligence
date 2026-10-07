import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';

const WSOL_MINT=new PublicKey('So11111111111111111111111111111111111111112');
const TOKEN_PROGRAM_ID=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

function text(v){ return String(v??'').trim(); }
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
function ataAddress(owner,mint){
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(),TOKEN_PROGRAM_ID.toBuffer(),mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}
async function tokenAmountRaw(connection, address){
  try{
    const r=await connection.getTokenAccountBalance(address,'confirmed');
    return BigInt(r.value.amount||'0');
  }catch{
    return 0n;
  }
}

const programIdText=text(process.env.SHADOW_DELEGATED_PROGRAM_ID);
if(!programIdText){
  console.error('ERROR: SHADOW_DELEGATED_PROGRAM_ID is not set.');
  process.exit(2);
}
let programId;
try{ programId=new PublicKey(programIdText); }
catch{
  console.error('ERROR: SHADOW_DELEGATED_PROGRAM_ID is not a valid Solana public key.');
  process.exit(2);
}

const connection=new Connection(rpcUrl(),'confirmed');
const dbPath=process.env.DB_PATH||'./shadow-intelligence.db';
if(!fs.existsSync(dbPath)){
  console.error(`ERROR: database not found: ${dbPath}`);
  process.exit(3);
}

const db=new DatabaseSync(dbPath,{readOnly:true});
const rows=db.prepare(`
  SELECT
    d.subscription_id,
    d.user_id,
    d.entity_id,
    d.owner_address,
    d.policy_address,
    d.vault_address,
    d.session_public_key,
    d.state,
    d.authorized_at,
    d.revoked_at,
    e.name AS entity_name,
    e.x_handle AS x_handle
  FROM delegated_copy_sessions d
  LEFT JOIN entities e ON e.id=d.entity_id
  ORDER BY d.updated_at DESC
`).all();

console.log('=== SYNC VAULT WITHDRAW AUDIT V21A ===');
console.log(`Cluster: ${clusterName()}`);
console.log(`Program ID: ${programId.toBase58()}`);
console.log(`Database: ${dbPath}`);
console.log(`Delegated sessions: ${rows.length}`);
console.log('');

const programInfo=await connection.getAccountInfo(programId,'confirmed');
console.log('--- DEPLOYED PROGRAM ---');
console.log(`Program account exists: ${!!programInfo}`);
console.log(`Executable: ${!!programInfo?.executable}`);
console.log(`Program account owner: ${programInfo?.owner?.toBase58?.()||''}`);
console.log('');

for(const row of rows){
  let vault, session, policy, owner;
  try{
    vault=new PublicKey(row.vault_address);
    session=new PublicKey(row.session_public_key);
    policy=new PublicKey(row.policy_address);
    owner=new PublicKey(row.owner_address);
  }catch{
    console.log(`SKIP malformed session ${row.subscription_id}`);
    continue;
  }
  const wsolAta=ataAddress(vault,WSOL_MINT);
  const [wsolRaw,sessionLamports,vaultLamports,policyInfo,wsolInfo]=await Promise.all([
    tokenAmountRaw(connection,wsolAta),
    connection.getBalance(session,'confirmed').catch(()=>0),
    connection.getBalance(vault,'confirmed').catch(()=>0),
    connection.getAccountInfo(policy,'confirmed').catch(()=>null),
    connection.getAccountInfo(wsolAta,'confirmed').catch(()=>null),
  ]);

  console.log('--- SESSION ---');
  console.log(`Entity: ${row.x_handle||row.entity_name||row.entity_id}`);
  console.log(`Subscription: ${row.subscription_id}`);
  console.log(`State: ${row.state}`);
  console.log(`Owner: ${owner.toBase58()}`);
  console.log(`Policy: ${policy.toBase58()}`);
  console.log(`Vault PDA: ${vault.toBase58()}`);
  console.log(`Vault PDA native SOL: ${(Number(vaultLamports)/1e9).toFixed(9)} SOL`);
  console.log(`Vault WSOL ATA: ${wsolAta.toBase58()}`);
  console.log(`Vault WSOL: ${(Number(wsolRaw)/1e9).toFixed(9)} SOL`);
  console.log(`WSOL ATA exists: ${!!wsolInfo}`);
  console.log(`Policy exists: ${!!policyInfo}`);
  console.log(`Session fee reserve: ${(Number(sessionLamports)/1e9).toFixed(9)} SOL`);
  console.log(`Authorized at: ${row.authorized_at||''}`);
  console.log(`Revoked at: ${row.revoked_at||''}`);
  console.log('');
}

console.log('=== IMPORTANT ===');
console.log('This audit moved NO funds and sent NO transaction.');
console.log('A WSOL ATA owned by the vault PDA cannot be closed by the owner wallet directly.');
console.log('Safe reclaim requires an instruction supported by the currently deployed delegated-vault program.');
console.log('The next step is to recover the deployed program IDL/source or verify its withdrawal instruction.');
