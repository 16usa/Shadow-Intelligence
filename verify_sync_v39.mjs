import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
const file=process.env.DB_PATH||'./shadow-intelligence.db';
if(!fs.existsSync(file)){console.error('DB_NOT_FOUND');process.exit(2)}
const db=new DatabaseSync(file,{readOnly:true});
const rpc=process.env.SOLANA_RPC_URL|| (process.env.HELIUS_API_KEY?`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`:(process.env.SHADOW_SOLANA_CLUSTER==='devnet'?'https://api.devnet.solana.com':'https://api.mainnet-beta.solana.com'));
const connection=new Connection(rpc,'confirmed');
const sha=v=>crypto.createHash('sha256').update(v).digest();
const short=v=>v?`${v.slice(0,7)}…${v.slice(-5)}`:'(none)';
const subs=db.prepare(`SELECT s.id,s.user_id,s.entity_id,s.user_wallet_id,w.address FROM copy_subscriptions s JOIN user_wallets w ON w.id=s.user_wallet_id ORDER BY s.updated_at DESC LIMIT 15`).all();
const sessions=db.prepare(`SELECT subscription_id,user_id,entity_id,funding_wallet_id,owner_address,session_public_key,policy_address,vault_address,program_id,revoked_at FROM delegated_copy_sessions`).all();
console.log('SYNC V39 ON-CHAIN VERIFICATION — READ ONLY');
for(const s of subs){for(const d of sessions.filter(x=>x.user_id===s.user_id&&x.entity_id===s.entity_id)){
  const result={current:short(s.id),original:short(d.subscription_id),sameOwner:s.address===d.owner_address,sameWalletRecord:s.user_wallet_id===d.funding_wallet_id,localRevoked:!!d.revoked_at};
  try{
    const owner=new PublicKey(d.owner_address),pid=new PublicKey(d.program_id),policy=new PublicKey(d.policy_address),vault=new PublicKey(d.vault_address);
    const [derivedPolicy]=PublicKey.findProgramAddressSync([Buffer.from('policy'),owner.toBuffer(),sha(d.subscription_id).subarray(0,32)],pid);
    const [derivedVault]=PublicKey.findProgramAddressSync([Buffer.from('vault'),derivedPolicy.toBuffer()],pid);
    result.originalPdaMatches=derivedPolicy.equals(policy)&&derivedVault.equals(vault);
    result.configuredProgramMatches=d.program_id===process.env.SHADOW_DELEGATED_PROGRAM_ID;
    const info=await connection.getAccountInfo(policy,'confirmed');
    result.onChainPolicyExists=!!info;
    result.onChainProgramOwnerMatches=!!info&&info.owner.equals(pid);
    if(info&&info.owner.equals(pid)&&info.data.length>=151){const b=info.data;let o=8;const chainOwner=new PublicKey(b.subarray(o,o+=32)).toBase58();const chainSession=new PublicKey(b.subarray(o,o+=32)).toBase58();const hash=b.subarray(o,o+=32);o+=32;const expiry=Number(b.readBigInt64LE(o));o+=8+8+8+8+8+2+1+1;const revoked=b[o]!==0;
      result.onChainOwnerMatches=chainOwner===d.owner_address;result.onChainSessionMatches=chainSession===d.session_public_key;result.onChainOriginalIdHashMatches=hash.equals(sha(d.subscription_id));result.onChainCurrentIdHashMatches=hash.equals(sha(s.id));result.onChainRevoked=revoked;result.onChainExpired=expiry<=Math.floor(Date.now()/1000);
    }else result.onChainDataValid=false;
  }catch(e){result.verificationError=String(e?.message||e).slice(0,140)}
  console.log(JSON.stringify(result));
}}
db.close();
console.log('NO CHANGES MADE. Do not share private keys or .env.');
