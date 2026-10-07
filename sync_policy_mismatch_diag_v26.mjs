import { DatabaseSync } from 'node:sqlite';
import { Connection, PublicKey } from '@solana/web3.js';

const dbPath=process.env.SYNC_DB_PATH||'./shadow-intelligence.db';
const rpc=
  process.env.HELIUS_RPC_URL||
  process.env.SOLANA_RPC_URL||
  process.env.SOLANA_RPC_ENDPOINT||
  process.env.RPC_URL||
  'https://api.mainnet-beta.solana.com';

const db=new DatabaseSync(dbPath);
const connection=new Connection(rpc,'confirmed');

function yes(v){ return Number(v||0)!==0; }
function asLamports(sol){
  return BigInt(Math.max(1,Math.round(Number(sol||0)*1_000_000_000)));
}
function parsePolicyData(data){
  const b=Buffer.from(data||[]);
  if(b.length<151)return null;
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
  const copyBuys=b[o++]!==0;
  const copySells=b[o++]!==0;
  const revoked=b[o++]!==0;
  const policyBump=b[o++];
  const vaultBump=b[o++];
  return {
    owner,sessionKey,subscriptionHash,expiresAt,maxTradeLamports,dailyCapLamports,
    spentTodayLamports,dayIndex,maxSellBps,copyBuys,copySells,revoked,policyBump,vaultBump
  };
}
function desired(sub){
  return {
    sessionKey:null,
    maxTradeLamports:asLamports(sub.amount_sol),
    dailyCapLamports:asLamports(sub.max_daily_sol),
    maxSellBps:Math.max(0,Math.min(10000,Math.round(Number(sub.sell_percent||100)*100))),
    copyBuys:yes(sub.copy_buys),
    copySells:yes(sub.copy_sells)||yes(sub.take_profit_enabled)||yes(sub.stop_loss_enabled),
  };
}
function short(v){
  const s=String(v||'');
  return s.length>18?s.slice(0,8)+'…'+s.slice(-8):s;
}

const sessions=db.prepare(`
  SELECT d.*,
         e.name AS entity_name,
         s.amount_sol,s.max_position_sol,s.max_daily_sol,s.sell_percent,
         s.copy_buys,s.copy_sells,s.take_profit_enabled,s.stop_loss_enabled,
         s.engine_state AS subscription_engine_state,
         s.enabled AS subscription_enabled
  FROM delegated_copy_sessions d
  LEFT JOIN copy_subscriptions s ON s.id=d.subscription_id
  LEFT JOIN entities e ON e.id=d.entity_id
  ORDER BY d.updated_at DESC
`).all();

console.log('=== SYNC POLICY MISMATCH DIAG V26 ===');
console.log('READ-ONLY: NO transaction, NO signature, NO funds moved.');
console.log('DB:',dbPath);
console.log('RPC:',rpc.replace(/api-key=[^&]+/i,'api-key=***'));
console.log('Sessions:',sessions.length);
console.log('');

for(const row of sessions){
  console.log('------------------------------------------------------------');
  console.log('Entity:',row.entity_name||row.entity_id);
  console.log('Subscription:',row.subscription_id);
  console.log('DB state:',row.state,'| subscription engine:',row.subscription_engine_state||'');
  console.log('Owner:',short(row.owner_address));
  console.log('Policy:',row.policy_address);
  console.log('DB session key:',row.session_public_key);

  if(row.amount_sol==null){
    console.log('RESULT: ORPHAN SESSION — exact copy_subscriptions row is missing.');
    console.log('');
    continue;
  }

  let info=null;
  try{
    info=await connection.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
  }catch(e){
    console.log('RPC ERROR:',String(e?.message||e));
    console.log('');
    continue;
  }
  if(!info){
    console.log('RESULT: POLICY ACCOUNT MISSING');
    console.log('');
    continue;
  }

  const policy=parsePolicyData(info.data);
  if(!policy){
    console.log('RESULT: POLICY DATA COULD NOT BE PARSED. bytes=',info.data.length);
    console.log('');
    continue;
  }

  const want=desired(row);
  want.sessionKey=row.session_public_key;

  const checks=[
    ['session_key',policy.sessionKey,want.sessionKey],
    ['max_trade_lamports',policy.maxTradeLamports,want.maxTradeLamports],
    ['daily_cap_lamports',policy.dailyCapLamports,want.dailyCapLamports],
    ['max_sell_bps',policy.maxSellBps,want.maxSellBps],
    ['copy_buys',policy.copyBuys,want.copyBuys],
    ['copy_sells',policy.copySells,want.copySells],
  ];
  const now=Math.floor(Date.now()/1000);
  const expiryOk=policy.expiresAt>now+300;
  const mismatches=[];

  for(const [name,onchain,desiredValue] of checks){
    const same=onchain===desiredValue;
    console.log(`${same?'OK  ':'FAIL'} ${name}: on-chain=${String(onchain)} desired=${String(desiredValue)}`);
    if(!same)mismatches.push(name);
  }
  console.log(`${expiryOk?'OK  ':'FAIL'} expires_at: on-chain=${policy.expiresAt} (${new Date(policy.expiresAt*1000).toISOString()})`);
  if(!expiryOk)mismatches.push('expires_at');
  console.log(`${policy.revoked?'FAIL':'OK  '} revoked: ${policy.revoked}`);
  if(policy.revoked)mismatches.push('revoked');

  console.log('Vault target SOL:',Number(row.max_position_sol||0));
  console.log('Buy amount SOL:',Number(row.amount_sol||0));
  console.log('Daily cap SOL:',Number(row.max_daily_sol||0));

  if(!mismatches.length){
    console.log('RESULT: POLICY MATCHES. If UI still says policy_update_required, the wrong session/subscription row is being selected.');
  }else{
    console.log('RESULT: MISMATCH ->',mismatches.join(', '));
    if(mismatches.includes('session_key')){
      console.log('IMPORTANT: current update_policy transaction does NOT change session_key.');
      console.log('Repeated AUTHORIZE will not fix a session_key mismatch.');
    }
  }
  console.log('');
}

console.log('=== DIAG COMPLETE ===');
console.log('NO transaction was sent. NO wallet signature was requested. NO funds moved.');
