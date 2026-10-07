import { Keypair, PublicKey } from '@solana/web3.js';
const text=v=>String(v||'').trim();
function key(raw){try{const b=Buffer.from(raw,'base64');return b.length===64?Keypair.fromSecretKey(b):null}catch{return null}}
const rows=[];
const pid=text(process.env.SHADOW_DELEGATED_PROGRAM_ID);
rows.push(['Program ID',!!pid&&(()=>{try{new PublicKey(pid);return true}catch{return false}})(),pid||'missing']);
rows.push(['Session master key',!!text(process.env.SHADOW_SESSION_MASTER_KEY),'configured']);
const payer=key(text(process.env.SYNC_EXECUTOR_FEE_PAYER_KEY||process.env.SHADOW_EXECUTOR_FEE_PAYER_KEY));
rows.push(['Executor fee payer',!!payer,payer?.publicKey.toBase58()||'missing']);
rows.push(['Jupiter API key',!!text(process.env.JUPITER_API_KEY),text(process.env.JUPITER_API_KEY)?'configured':'missing']);
const cluster=text(process.env.SHADOW_SOLANA_CLUSTER)||'mainnet-beta';
const approved=['true','1','yes'].includes(text(process.env.SYNC_DELEGATED_MAINNET_APPROVED||process.env.SHADOW_DELEGATED_MAINNET_APPROVED).toLowerCase());
rows.push(['Cluster',true,cluster]);
rows.push(['Mainnet approval',cluster!=='mainnet-beta'||approved,approved?'enabled':'disabled']);
for(const [name,ok,detail] of rows)console.log(`${ok?'OK ':'NO '} ${name}: ${detail}`);
if(rows.some(r=>!r[1]))process.exitCode=2;
