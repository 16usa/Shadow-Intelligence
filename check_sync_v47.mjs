import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
const dbPath=process.env.DB_PATH||'./shadow-intelligence.db';
if(!fs.existsSync(dbPath)){console.error('DB_NOT_FOUND');process.exit(2)}
const db=new DatabaseSync(dbPath,{readOnly:true});
const rpc=process.env.SOLANA_RPC_URL||(process.env.HELIUS_API_KEY?`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`:'https://api.mainnet-beta.solana.com');
const conn=new Connection(rpc,'confirmed');
const hash=s=>crypto.createHash('sha256').update(s).digest();
const short=s=>s?`${s.slice(0,7)}…${s.slice(-5)}`:'none';
const sessions=db.prepare('SELECT subscription_id,user_id,entity_id,funding_wallet_id,owner_address,session_public_key,policy_address,vault_address,program_id,revoked_at FROM delegated_copy_sessions ORDER BY created_at').all();
const subs=db.prepare('SELECT s.id,s.user_id,s.entity_id,s.user_wallet_id,w.address FROM copy_subscriptions s JOIN user_wallets w ON w.id=s.user_wallet_id').all();
let valid=0, blocked=0, unknown=0;
console.log('SYNC V47 — READ ONLY: all historical delegated policies');
for(const s of sessions){
  const current=subs.find(x=>x.user_id===s.user_id&&x.entity_id===s.entity_id);
  const out={session:short(s.subscription_id),currentSubscription:short(current?.id),sameOwner:current?current.address===s.owner_address:null,sameWalletRecord:current?current.user_wallet_id===s.funding_wallet_id:null,localRevoked:!!s.revoked_at};
  try{
    const owner=new PublicKey(s.owner_address),pid=new PublicKey(s.program_id),policy=new PublicKey(s.policy_address),vault=new PublicKey(s.vault_address);
    const [p]=PublicKey.findProgramAddressSync([Buffer.from('policy'),owner.toBuffer(),hash(s.subscription_id)],pid);
    const [v]=PublicKey.findProgramAddressSync([Buffer.from('vault'),p.toBuffer()],pid);
    out.pdaMatches=p.equals(policy)&&v.equals(vault);
    out.programConfigured=s.program_id===process.env.SHADOW_DELEGATED_PROGRAM_ID;
    const info=await conn.getAccountInfo(policy,'confirmed');
    out.policyExists=!!info;
    out.programOwnerMatches=!!info&&info.owner.equals(pid);
    if(!info||!out.programOwnerMatches||info.data.length<151){out.verdict='UNVERIFIED';unknown++;}
    else {
      const b=info.data;let o=8;
      const chainOwner=new PublicKey(b.subarray(o,o+=32)).toBase58();
      const chainSession=new PublicKey(b.subarray(o,o+=32)).toBase58();
      const chainHash=b.subarray(o,o+=32);const expiresAt=Number(b.readBigInt64LE(o));
      o+=8+8+8+8+8+2+1+1;
      out.ownerMatches=chainOwner===s.owner_address;
      out.sessionMatches=chainSession===s.session_public_key;
      out.originalSubscriptionMatches=chainHash.equals(hash(s.subscription_id));
      out.revoked=b[o]!==0;
      out.expired=expiresAt<=Math.floor(Date.now()/1000);
      out.verdict=out.pdaMatches&&out.programOwnerMatches&&out.ownerMatches&&out.sessionMatches&&out.originalSubscriptionMatches&&!out.revoked&&!out.expired&&!out.localRevoked?'POTENTIALLY_USABLE':'BLOCKED';
      if(out.verdict==='POTENTIALLY_USABLE')valid++;else blocked++;
    }
  }catch(e){out.verdict='UNVERIFIED';out.error=String(e?.message||e).slice(0,100);unknown++;}
  console.log(JSON.stringify(out));
}
console.log(JSON.stringify({summary:{total:sessions.length,potentiallyUsable:valid,blocked,unverified:unknown},readOnly:true,noTransactions:true}));
db.close();
