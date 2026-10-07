#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT = Path.cwd()
ENGINE = ROOT / "src/internal-copy-engine.mjs"
MARK = "SYNC_POLICY_UPDATE_FIX_V27"

if not ENGINE.is_file():
    raise SystemExit("ERROR: src/internal-copy-engine.mjs not found. Run from ~/workspace.")

src = ENGINE.read_text()
if MARK in src:
    print("SYNC POLICY UPDATE FIX V27 ALREADY INSTALLED")
    raise SystemExit(0)

bak = ROOT / "src/internal-copy-engine.mjs.bak-policy-update-v27"
shutil.copy2(ENGINE, bak)

def fail(msg):
    shutil.copy2(bak, ENGINE)
    raise SystemExit("ERROR: " + msg + ". Original engine restored.")

try:
    policy_anchor = """function policyMatches(policy,subscription,row){
  if(!policy||policy.revoked)return false;
  const d=desiredPolicy(subscription);
  return policy.sessionKey===row.session_public_key &&
    policy.maxTradeLamports===d.maxTradeLamports &&
    policy.dailyCapLamports===d.dailyCapLamports &&
    policy.maxSellBps===d.maxSellBps &&
    policy.copyBuys===d.copyBuys && policy.copySells===d.copySells &&
    policy.expiresAt>Math.floor(Date.now()/1000)+300;
}"""

    policy_extra = """

/* SYNC_POLICY_UPDATE_FIX_V27 */
function policySettingsMatchDesired(policy,d,row){
  if(!policy||policy.revoked)return false;
  return policy.sessionKey===row.session_public_key &&
    policy.maxTradeLamports===d.maxTradeLamports &&
    policy.dailyCapLamports===d.dailyCapLamports &&
    policy.maxSellBps===d.maxSellBps &&
    policy.copyBuys===d.copyBuys &&
    policy.copySells===d.copySells;
}
/* SYNC_POLICY_UPDATE_FIX_V27_END */
"""

    if policy_anchor not in src:
        fail("policyMatches anchor not found")
    src = src.replace(policy_anchor, policy_anchor + policy_extra, 1)

    state_anchor = """  async function policyState(row){
    try{
      const info=await connection.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
      if(!info||!info.owner.equals(new PublicKey(row.program_id)))return null;
      return parsePolicyData(info.data);
    }catch(error){lastError=String(error?.message||error);return null}
  }"""

    state_extra = """
  /* SYNC_POLICY_UPDATE_FIX_V27 */
  async function simulatePolicyUpdateData(row,pid,owner,policy,expiresAt,d,data){
    try{
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
          commitment:'confirmed',
          accounts:{
            encoding:'base64',
            addresses:[policy.toBase58()]
          }
        }
      ]);

      const value=rpc?.result?.value;
      if(!value||value.err)return null;

      const account=value.accounts?.[0];
      const encoded=Array.isArray(account?.data)?account.data[0]:account?.data;
      if(!encoded)return null;

      const post=parsePolicyData(Buffer.from(encoded,'base64'));
      if(!post)return null;

      return {
        post,
        matches:policySettingsMatchDesired(post,d,row) &&
          post.expiresAt>Math.floor(Date.now()/1000)+300
      };
    }catch(error){
      lastError='policy update simulation: '+String(error?.message||error);
      return null;
    }
  }

  async function verifiedUpdatePolicyData(row,pid,owner,policy,expiresAt,d){
    const standard=Buffer.concat([
      UPDATE_DISC,
      i64(expiresAt),
      u64(d.maxTradeLamports),
      u64(d.dailyCapLamports),
      u16(d.maxSellBps),
      bool(d.copyBuys),
      bool(d.copySells)
    ]);

    const swapped=Buffer.concat([
      UPDATE_DISC,
      i64(expiresAt),
      u64(d.dailyCapLamports),
      u64(d.maxTradeLamports),
      u16(d.maxSellBps),
      bool(d.copyBuys),
      bool(d.copySells)
    ]);

    const candidates=d.maxTradeLamports===d.dailyCapLamports
      ? [{name:'standard',data:standard}]
      : [
          {name:'standard',data:standard},
          {name:'swapped-u64',data:swapped}
        ];

    for(const candidate of candidates){
      const simulation=await simulatePolicyUpdateData(
        row,pid,owner,policy,expiresAt,d,candidate.data
      );
      if(simulation?.matches){
        lastError='';
        return {
          data:candidate.data,
          encoding:candidate.name,
          simulatedPolicy:simulation.post
        };
      }
    }

    throw Object.assign(
      new Error(
        'Could not build a policy update that matches the current copy settings. '+
        'No transaction was prepared and no funds were moved.'
      ),
      {statusCode:409,code:'POLICY_UPDATE_ENCODING_UNVERIFIED'}
    );
  }
  /* SYNC_POLICY_UPDATE_FIX_V27_END */
"""

    if state_anchor not in src:
        fail("policyState anchor not found")
    src = src.replace(state_anchor, state_anchor + state_extra, 1)

    old_update = """      }else{
        const data=Buffer.concat([UPDATE_DISC,i64(expiresAt),u64(d.maxTradeLamports),u64(d.dailyCapLamports),u16(d.maxSellBps),bool(d.copyBuys),bool(d.copySells)]);
        tx.add(new TransactionInstruction({programId:pid,keys:[{pubkey:owner,isSigner:true,isWritable:false},{pubkey:policy,isSigner:false,isWritable:true}],data}));
      }"""

    new_update = """      }else{
        // V27: verify the deployed program's real UpdatePolicy layout by
        // simulation before the wallet is ever asked to sign.
        const verified=await verifiedUpdatePolicyData(
          row,pid,owner,policy,expiresAt,d
        );
        tx.add(new TransactionInstruction({
          programId:pid,
          keys:[
            {pubkey:owner,isSigner:true,isWritable:false},
            {pubkey:policy,isSigner:false,isWritable:true}
          ],
          data:verified.data
        }));
      }"""

    if old_update not in src:
        fail("UpdatePolicy branch not found")
    src = src.replace(old_update, new_update, 1)

    ENGINE.write_text(src)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC POLICY UPDATE FIX V27 INSTALLED")
print("Backup:", bak)
print("")
print("Fix:")
print("  - simulates UpdatePolicy before wallet signing")
print("  - reads the simulated post-policy account")
print("  - selects only an encoding that exactly matches current settings")
print("  - tests standard and swapped max-trade/daily-cap u64 layouts")
print("  - fails closed if neither layout matches")
print("  - simulation sends NO transaction and moves NO funds")
