import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Connection, PublicKey } from '@solana/web3.js';

const path=process.env.DB_PATH||'./shadow-intelligence.db';
if(!existsSync(path))throw new Error('DB_NOT_FOUND');
const db=new DatabaseSync(path,{readOnly:true});
const rpc=process.env.SOLANA_RPC_URL||(process.env.HELIUS_API_KEY?`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`:'https://api.mainnet-beta.solana.com');
const conn=new Connection(rpc,'confirmed');
const hash=s=>createHash('sha256').update(s).digest();
const short=s=>s?`${s.slice(0,7)}…${s.slice(-5)}`:'none';
const sessions=db.prepare('SELECT subscription_id,user_id,entity_id,funding_wallet_id,owner_address,session_public_key,policy_address,vault_address,program_id,revoked_at FROM delegated_copy_sessions').all();
const subs=db.prepare('SELECT s.id,s.user_id,s.entity_id,s.user_wallet_id,w.address FROM copy_subscriptions s JOIN user_wallets w ON w.id=s.user_wallet_id').all();
console.log('SYNC V48 READ ONLY — identity and policy eligibility; no authorization or transactions');
let eligible=0;
for(const s of sessions){
  const current=subs.find(x=>x.user_id===s.user_id&&x.entity_id===s.entity_id);
  const result={session:short(s.subscription_id),current:short(current?.id),sameOwner:current?current.address===s.owner_address:false,sameWalletRecord:current?current.user_wallet_id===s.funding_wallet_id:false,originalSubscriptionIsCurrent:current?current.id===s.subscription_id:false,localRevoked:!!s.revoked_at};
  try{
    const owner=new PublicKey(s.owner_address),pid=new PublicKey(s.program_id),policy=new PublicKey(s.policy_address);
    const [p]=PublicKey.findProgramAddressSync([Buffer.from('policy'),owner.toBuffer(),hash(s.subscription_id)],pid);
    const [v]=PublicKey.findProgramAddressSync([Buffer.from('vault'),p.toBuffer()],pid);
    result.pdaMatches=p.equals(policy)&&v.toBase58()===s.vault_address;
    result.programConfigured=s.program_id===process.env.SHADOW_DELEGATED_PROGRAM_ID;
    const info=await conn.getAccountInfo(policy,'confirmed');
    result.policyExists=!!info;
    result.programOwnerMatches=!!info&&info.owner.equals(pid);
    if(info&&result.programOwnerMatches&&info.data.length>=151){
      const b=info.data;let o=8;
      result.chainOwnerMatches=new PublicKey(b.subarray(o,o+=32)).equals(owner);
      result.chainSessionMatches=new PublicKey(b.subarray(o,o+=32)).toBase58()===s.session_public_key;
      result.chainOriginalHashMatches=b.subarray(o,o+=32).equals(hash(s.subscription_id));
      const expiresAt=Number(b.readBigInt64LE(o));o+=8+8+8+8+8+2+1+1;
      result.chainRevoked=b[o]!==0;
      result.chainExpired=expiresAt<=Math.floor(Date.now()/1000)+300;
    }
    result.safeForAutomaticReuse=Boolean(current&&result.sameOwner&&result.sameWalletRecord&&result.originalSubscriptionIsCurrent&&result.pdaMatches&&result.programConfigured&&result.policyExists&&result.programOwnerMatches&&result.chainOwnerMatches&&result.chainSessionMatches&&result.chainOriginalHashMatches&&!result.chainRevoked&&!result.chainExpired&&!result.localRevoked);
    if(result.safeForAutomaticReuse)eligible++;
    result.reason=result.safeForAutomaticReuse?'IDENTITY_VERIFIED':'MANUAL_RECOVERY_REQUIRED';
  }catch(e){result.safeForAutomaticReuse=false;result.reason='RPC_OR_DATA_UNVERIFIED';result.error=String(e?.message||e).slice(0,90)}
  console.log(JSON.stringify(result));
}
console.log(JSON.stringify({summary:{sessions:sessions.length,safeForAutomaticReuse:eligible},readOnly:true,noTransactions:true,noDatabaseChanges:true}));
db.close();
