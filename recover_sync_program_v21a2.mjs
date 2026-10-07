import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {Connection,PublicKey} from '@solana/web3.js';

const text=v=>String(v??'').trim();
function rpcUrl(){
  const direct=text(process.env.SOLANA_RPC_URL);
  if(/^https?:\/\//i.test(direct))return direct;
  const helius=text(process.env.HELIUS_API_KEY);
  if(helius)return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius)}`;
  return text(process.env.SHADOW_SOLANA_CLUSTER).toLowerCase()==='devnet'
    ?'https://api.devnet.solana.com'
    :'https://api.mainnet-beta.solana.com';
}
const pidText=text(process.env.SHADOW_DELEGATED_PROGRAM_ID);
if(!pidText)throw new Error('SHADOW_DELEGATED_PROGRAM_ID is not set');
const pid=new PublicKey(pidText);
const connection=new Connection(rpcUrl(),'confirmed');

function disc(name){
  return crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0,8);
}
function findAll(buf,needle){
  const out=[]; let off=0;
  while((off=buf.indexOf(needle,off))>=0){out.push(off);off+=1}
  return out;
}
function asciiStrings(buf,min=5){
  const out=[]; let s='',start=0;
  for(let i=0;i<buf.length;i++){
    const c=buf[i];
    if(c>=32&&c<=126){
      if(!s)start=i;
      s+=String.fromCharCode(c);
    }else{
      if(s.length>=min)out.push({start,s});
      s='';
    }
  }
  if(s.length>=min)out.push({start,s});
  return out;
}

console.log('=== SYNC PROGRAM RECOVERY V21A2 ===');
console.log(`Program ID: ${pid.toBase58()}`);
console.log(`RPC: ${rpcUrl().replace(/api-key=[^&]+/,'api-key=***')}`);

const prog=await connection.getAccountInfo(pid,'confirmed');
if(!prog)throw new Error('Program account not found');
console.log(`Program executable: ${!!prog.executable}`);
console.log(`Program loader: ${prog.owner.toBase58()}`);
console.log(`Program account data bytes: ${prog.data.length}`);

let programDataPk=null;
if(prog.data.length>=36){
  const variant=prog.data.readUInt32LE(0);
  console.log(`Upgradeable-loader state variant: ${variant}`);
  if(variant===2){
    programDataPk=new PublicKey(prog.data.subarray(4,36));
  }
}
if(!programDataPk)throw new Error('Could not resolve ProgramData account');

console.log(`ProgramData: ${programDataPk.toBase58()}`);
const pd=await connection.getAccountInfo(programDataPk,'confirmed');
if(!pd)throw new Error('ProgramData account not found');
console.log(`ProgramData bytes: ${pd.data.length}`);

const elfAt=pd.data.indexOf(Buffer.from([0x7f,0x45,0x4c,0x46]));
if(elfAt<0)throw new Error('ELF payload not found inside ProgramData');
const elf=pd.data.subarray(elfAt);
fs.writeFileSync('SYNC_DEPLOYED_PROGRAM_CURRENT.so',elf);
console.log(`ELF offset in ProgramData: ${elfAt}`);
console.log(`ELF bytes: ${elf.length}`);
console.log(`ELF SHA256: ${crypto.createHash('sha256').update(elf).digest('hex')}`);

console.log('\n--- ANCHOR IDL PROBE ---');
try{
  const [base]=PublicKey.findProgramAddressSync([],pid);
  const idlAddress=await PublicKey.createWithSeed(base,'anchor:idl',pid);
  console.log(`Legacy Anchor IDL address: ${idlAddress.toBase58()}`);
  const idlInfo=await connection.getAccountInfo(idlAddress,'confirmed');
  if(!idlInfo){
    console.log('IDL account: not found');
  }else{
    console.log(`IDL account bytes: ${idlInfo.data.length}`);
    let parsed=null;
    for(let off=40;off<Math.min(idlInfo.data.length,96);off++){
      const b0=idlInfo.data[off],b1=idlInfo.data[off+1];
      if(b0===0x78 && [0x01,0x5e,0x9c,0xda].includes(b1)){
        try{
          const raw=zlib.inflateSync(idlInfo.data.subarray(off));
          const js=JSON.parse(raw.toString('utf8'));
          parsed=js;
          console.log(`IDL decompressed at offset ${off}`);
          break;
        }catch{}
      }
    }
    if(parsed){
      fs.writeFileSync('SYNC_DEPLOYED_IDL.json',JSON.stringify(parsed,null,2));
      console.log('IDL: RECOVERED -> SYNC_DEPLOYED_IDL.json');
      const ix=(parsed.instructions||[]).map(x=>x.name);
      console.log(`IDL instructions: ${ix.join(', ')||'(none)'}`);
    }else{
      console.log('IDL account exists but could not be decoded automatically');
      fs.writeFileSync('SYNC_DEPLOYED_IDL_ACCOUNT.bin',idlInfo.data);
    }
  }
}catch(e){
  console.log(`IDL probe error: ${e.message}`);
}

console.log('\n--- INSTRUCTION DISCRIMINATOR SCAN ---');
const candidates=[
  'initialize_policy','revoke_session','withdraw','withdraw_all','withdraw_sol',
  'withdraw_vault','close_vault','close_account','close_policy','close_session',
  'deposit','deposit_sol','fund_vault','fund_session','refund_reserve',
  'reclaim','reclaim_vault','emergency_withdraw','sweep_vault','close_wsol',
  'update_policy','execute_swap','execute_trade','execute_pump_v2'
];
for(const name of candidates){
  const d=disc(name);
  const hits=findAll(elf,d);
  console.log(`${name.padEnd(22)} ${d.toString('hex')} hits=${hits.length}${hits.length?' @ '+hits.slice(0,8).join(','):''}`);
}

console.log('\n--- INTERESTING ASCII STRINGS ---');
const strs=asciiStrings(elf,5).filter(x=>/withdraw|revoke|vault|policy|session|close|deposit|fund|refund|wsol/i.test(x.s));
for(const x of strs.slice(0,250))console.log(`${x.start}: ${x.s}`);

console.log('\n--- RECENT PROGRAM INSTRUCTION PREFIXES ---');
try{
  const sigs=await connection.getSignaturesForAddress(pid,{limit:100},'confirmed');
  const counts=new Map();
  for(const s of sigs.slice(0,60)){
    const tx=await connection.getTransaction(s.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0}).catch(()=>null);
    if(!tx)continue;
    const keys=tx.transaction.message.getAccountKeys?.().staticAccountKeys || tx.transaction.message.staticAccountKeys || [];
    const ixs=tx.transaction.message.compiledInstructions || tx.transaction.message.instructions || [];
    for(const ix of ixs){
      let programKey=null;
      if(typeof ix.programIdIndex==='number')programKey=keys[ix.programIdIndex];
      if(!programKey || programKey.toBase58()!==pid.toBase58())continue;
      let raw=null;
      if(Buffer.isBuffer(ix.data))raw=ix.data;
      else if(ix.data instanceof Uint8Array)raw=Buffer.from(ix.data);
      else if(typeof ix.data==='string'){
        try{ raw=Buffer.from(ix.data,'base64'); }catch{}
      }
      if(raw&&raw.length>=8){
        const h=raw.subarray(0,8).toString('hex');
        counts.set(h,(counts.get(h)||0)+1);
      }
    }
  }
  for(const [h,n] of [...counts.entries()].sort((a,b)=>b[1]-a[1])){
    const match=candidates.find(name=>disc(name).toString('hex')===h)||'unknown';
    console.log(`${h} count=${n} candidate=${match}`);
  }
}catch(e){
  console.log(`Recent transaction scan error: ${e.message}`);
}

console.log('\n=== RECOVERY COMPLETE ===');
console.log('NO transaction was sent.');
console.log('NO wallet signature was requested.');
console.log('NO funds moved.');
console.log('Upload/show SYNC_PROGRAM_RECOVERY_V21A2.txt and any recovered SYNC_DEPLOYED_IDL.json.');
