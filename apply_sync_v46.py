from pathlib import Path
import subprocess
p=Path('src/sync-vault-reclaim.mjs')
s=p.read_text()
old="""      const data=typeof ix.data==='string'?null:Buffer.from(ix.data||[]);
      return data&&(data.subarray(0,8).equals(WITHDRAW_TOKEN_DISC)||data.subarray(0,8).equals(REVOKE_DISC));"""
new="""      // V46: Solana RPC returns compiled instruction data as base58 strings.
      // Reject malformed encodings instead of treating them as empty bytes.
      let data;
      try { data=typeof ix.data==='string'?decodeBase58(ix.data):Buffer.from(ix.data||[]); }
      catch { return false; }
      return data.length>=8&&(data.subarray(0,8).equals(WITHDRAW_TOKEN_DISC)||data.subarray(0,8).equals(REVOKE_DISC));"""
marker="const text=v=>String(v??'').trim();"
helper="""// V46: standalone base58 decoder for Solana compiled instruction bytes.
function decodeBase58(value){
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if(typeof value!=='string'||!value.length||value.length>4096)throw new Error('Invalid base58');
  let n=0n;
  for(const char of value){
    const digit=alphabet.indexOf(char);
    if(digit<0)throw new Error('Invalid base58 character');
    n=n*58n+BigInt(digit);
  }
  const bytes=[];
  while(n>0n){bytes.push(Number(n&255n));n>>=8n;}
  bytes.reverse();
  const zeroes=value.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(zeroes),Buffer.from(bytes)]);
}
"""
if 'V46: Solana RPC returns compiled instruction data' in s:
 print('V46 already applied')
else:
 if s.count(old)!=1 or s.count(marker)!=1:raise SystemExit('V46 anchor mismatch: no changes made')
 patched=s.replace(old,new,1).replace(marker,helper+marker,1)
 temp=p.with_suffix('.v46.tmp.mjs')
 temp.write_text(patched)
 try:subprocess.run(['node','--check',str(temp)],check=True)
 finally:temp.unlink(missing_ok=True)
 p.write_text(patched)
 print('V46 installed: base58 instruction verification; syntax OK; no DB or Solana transactions')
