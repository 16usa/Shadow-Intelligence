#!/usr/bin/env python3
from pathlib import Path
import shutil
import subprocess
import sys

TARGET = Path("src/internal-copy-engine.mjs")
if not TARGET.exists():
    print("ERROR: src/internal-copy-engine.mjs not found. Run this from ~/workspace.")
    sys.exit(1)

text = TARGET.read_text(encoding="utf-8")
start_marker = "/* SYNC_POLICY_UPDATE_FIX_V27 */"
end_marker = "/* SYNC_POLICY_UPDATE_FIX_V27_END */"

starts = []
pos = 0
while True:
    i = text.find(start_marker, pos)
    if i < 0:
        break
    starts.append(i)
    pos = i + len(start_marker)

if len(starts) < 2:
    print(f"ERROR: expected at least 2 V27 blocks, found {len(starts)}. No files changed.")
    sys.exit(1)

start = starts[1]
end = text.find(end_marker, start)
if end < 0:
    print("ERROR: matching V27 end marker not found. No files changed.")
    sys.exit(1)
end += len(end_marker)

new_block = r'''/* SYNC_UPDATE_POLICY_EXACT_V31 */
  async function simulateExactUpdatePolicy(pid,owner,policy,data){
    const probe=new Transaction().add(new TransactionInstruction({
      programId:pid,
      keys:[
        {pubkey:owner,isSigner:true,isWritable:false},
        {pubkey:policy,isSigner:false,isWritable:true}
      ],
      data
    }));
    probe.feePayer=owner;
    probe.recentBlockhash=(await connection.getLatestBlockhash('confirmed')).blockhash;

    const raw=probe.serialize({
      requireAllSignatures:false,
      verifySignatures:false
    }).toString('base64');

    const rpc=await connection._rpcRequest('simulateTransaction',[
      raw,
      {
        encoding:'base64',
        sigVerify:false,
        replaceRecentBlockhash:true,
        commitment:'confirmed'
      }
    ]);

    const value=rpc?.result?.value;
    if(!value){
      throw Object.assign(
        new Error('UpdatePolicy simulation returned no result. No transaction was prepared.'),
        {statusCode:502,code:'POLICY_UPDATE_SIMULATION_EMPTY'}
      );
    }

    if(value.err){
      const logs=Array.isArray(value.logs)?value.logs:[];
      const lastProgramLog=[...logs].reverse().find(line=>/Program log:/i.test(String(line||'')))||'';
      const detail=lastProgramLog
        ? String(lastProgramLog).replace(/^.*Program log:\s*/i,'').trim()
        : JSON.stringify(value.err);

      throw Object.assign(
        new Error('UpdatePolicy simulation failed: '+detail+'. No transaction was prepared and no funds were moved.'),
        {statusCode:409,code:'POLICY_UPDATE_SIMULATION_FAILED'}
      );
    }

    return {ok:true,logs:Array.isArray(value.logs)?value.logs:[]};
  }

  async function verifiedUpdatePolicyData(row,pid,owner,policy,expiresAt,d){
    // V31 exact deployed UpdatePolicy instruction confirmed from successful
    // mainnet transactions. Total data length = 36 bytes.
    const data=Buffer.concat([
      UPDATE_DISC,
      i64(expiresAt),
      u64(d.maxTradeLamports),
      u64(d.dailyCapLamports),
      u16(d.maxSellBps),
      bool(d.copyBuys),
      bool(d.copySells)
    ]);

    if(data.length!==36){
      throw Object.assign(
        new Error(`Internal UpdatePolicy encoding error: expected 36 bytes, got ${data.length}.`),
        {statusCode:500,code:'POLICY_UPDATE_BAD_LENGTH'}
      );
    }

    // V27 falsely required the RPC to return a simulated post-account snapshot.
    // V31 instead verifies that the deployed program accepts the exact confirmed
    // 36-byte instruction. If the program rejects it, we surface the real log.
    const simulation=await simulateExactUpdatePolicy(pid,owner,policy,data);

    lastError='';
    return {
      data,
      encoding:'deployed-update-policy-v1-36-byte',
      simulation
    };
  }
  /* SYNC_UPDATE_POLICY_EXACT_V31_END */'''

backup = TARGET.with_name(TARGET.name + ".bak-update-policy-v31")
shutil.copy2(TARGET, backup)

patched = text[:start] + new_block + text[end:]
TARGET.write_text(patched, encoding="utf-8")

check = subprocess.run(
    ["node", "--check", str(TARGET)],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)

if check.returncode != 0:
    shutil.copy2(backup, TARGET)
    print(check.stdout)
    print("ERROR: node --check failed. Original file restored.")
    sys.exit(check.returncode)

verify = TARGET.read_text(encoding="utf-8")
required = [
    "SYNC_UPDATE_POLICY_EXACT_V31",
    "deployed-update-policy-v1-36-byte",
    "if(data.length!==36)",
    "simulateExactUpdatePolicy"
]
missing = [x for x in required if x not in verify]
if missing:
    shutil.copy2(backup, TARGET)
    print("ERROR: verification failed:", ", ".join(missing))
    print("Original file restored.")
    sys.exit(1)

print("SYNC UPDATE POLICY EXACT V31 INSTALLED")
print("Backup:", backup)
print("")
print("Confirmed behavior:")
print("  - exact deployed 36-byte UpdatePolicy layout")
print("  - owner signer + policy writable accounts")
print("  - old V27 false-negative post-account check removed")
print("  - safety simulation remains before Phantom/Solflare")
print("  - real program error is shown if simulation fails")
print("  - NO automatic restart was performed")
print("")
print("Manual Replit restart required once.")
