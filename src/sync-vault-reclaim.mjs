/* SYNC_STOP_RECLAIM_V21B
 * Owner-signed reclaim for the deployed delegated-vault program.
 */
import crypto from 'node:crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

const WSOL_MINT=new PublicKey('So11111111111111111111111111111111111111112');
const TOKEN_PROGRAM_ID=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// V46: standalone base58 decoder for Solana compiled instruction bytes.
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
const text=v=>String(v??'').trim();
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest();
const discriminator=name=>sha256(`global:${name}`).subarray(0,8);
const WITHDRAW_TOKEN_DISC=discriminator('withdraw_token');
const REVOKE_DISC=discriminator('revoke_session');

function u64(n){
  const b=Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function rpcUrl(){
  const direct=text(process.env.SOLANA_RPC_URL);
  if(/^https?:\/\//i.test(direct))return direct;
  const helius=text(process.env.HELIUS_API_KEY);
  if(helius)return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius)}`;
  return text(process.env.SHADOW_SOLANA_CLUSTER).toLowerCase()==='devnet'
    ?'https://api.devnet.solana.com'
    :'https://api.mainnet-beta.solana.com';
}
function connection(){
  return new Connection(rpcUrl(),'confirmed');
}
function ataAddress(owner,mint){
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(),TOKEN_PROGRAM_ID.toBuffer(),mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}
function createAtaIdempotentIx(payer,owner,mint,ata){
  return new TransactionInstruction({
    programId:ASSOCIATED_TOKEN_PROGRAM_ID,
    keys:[
      {pubkey:payer,isSigner:true,isWritable:true},
      {pubkey:ata,isSigner:false,isWritable:true},
      {pubkey:owner,isSigner:false,isWritable:false},
      {pubkey:mint,isSigner:false,isWritable:false},
      {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
      {pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
    ],
    data:Buffer.from([1]),
  });
}
function closeTokenAccountIx(account,destination,owner){
  return new TransactionInstruction({
    programId:TOKEN_PROGRAM_ID,
    keys:[
      {pubkey:account,isSigner:false,isWritable:true},
      {pubkey:destination,isSigner:false,isWritable:true},
      {pubkey:owner,isSigner:true,isWritable:false},
    ],
    data:Buffer.from([9]),
  });
}
function sessionRow(db,userId,entityId){
  // V41: The original copy subscription may have been deleted or recreated.
  // Reclaim must resolve the ORIGINAL vault, never derive a new PDA.
  // Require a verified wallet record for the same user and owner address.
  const rows=db.prepare(`
    SELECT d.*,uw.address AS funding_address
    FROM delegated_copy_sessions d
    JOIN user_wallets uw
      ON uw.user_id=d.user_id AND uw.address=d.owner_address
    WHERE d.user_id=? AND d.entity_id=?
    LIMIT 2
  `).all(userId,entityId);
  if(rows.length>1){
    throw Object.assign(new Error('Ambiguous delegated vault sessions; reclaim stopped'),{statusCode:409});
  }
  return rows[0]||null;
}
function publicAsset(a){
  return {
    tokenAccount:a.tokenAccount.toBase58(),
    mint:a.mint.toBase58(),
    amountRaw:a.amountRaw.toString(),
    decimals:a.decimals,
    uiAmount:a.uiAmount,
    isWsol:a.mint.equals(WSOL_MINT),
  };
}
async function vaultAssets(conn,vault){
  const response=await conn.getParsedTokenAccountsByOwner(
    vault,
    {programId:TOKEN_PROGRAM_ID},
    'confirmed'
  );
  const out=[];
  for(const item of response.value||[]){
    try{
      const info=item.account.data?.parsed?.info;
      const amount=info?.tokenAmount;
      const raw=BigInt(amount?.amount||'0');
      if(raw<=0n)continue;
      out.push({
        tokenAccount:item.pubkey,
        mint:new PublicKey(info.mint),
        amountRaw:raw,
        decimals:Number(amount.decimals||0),
        uiAmount:String(amount.uiAmountString||amount.uiAmount||'0'),
      });
    }catch{}
  }
  return out;
}
function parseMasterKey(){
  const raw=text(process.env.SHADOW_SESSION_MASTER_KEY);
  if(!raw)return null;
  try{
    const b=/^[0-9a-f]{64}$/i.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64');
    return b.length===32?b:null;
  }catch{return null}
}
function decryptSessionKeypair(row){
  const key=parseMasterKey();
  if(!key)throw new Error('SHADOW_SESSION_MASTER_KEY is not configured');
  const decipher=crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(row.seed_iv,'base64')
  );
  decipher.setAuthTag(Buffer.from(row.seed_tag,'base64'));
  const seed=Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_session_seed,'base64')),
    decipher.final()
  ]);
  if(seed.length!==32)throw new Error('Scoped session seed is invalid');
  const kp=Keypair.fromSeed(seed);
  if(kp.publicKey.toBase58()!==row.session_public_key){
    throw new Error('Scoped session key does not match stored public key');
  }
  return kp;
}
async function waitForSignature(conn,signature){
  for(let i=0;i<24;i++){
    const status=await conn.getSignatureStatuses([signature],{searchTransactionHistory:true});
    const s=status.value?.[0];
    if(s?.err)throw new Error(`On-chain reclaim transaction failed: ${JSON.stringify(s.err)}`);
    if(s && (s.confirmationStatus==='confirmed'||s.confirmationStatus==='finalized')){
      return true;
    }
    await new Promise(r=>setTimeout(r,650));
  }
  throw new Error(`Timed out waiting for reclaim transaction ${String(signature).slice(0,12)}…`);
}
async function refundSessionReserve(conn,row){
  let session;
  try{session=decryptSessionKeypair(row)}
  catch(error){
    return {ok:false,refundedLamports:0,signature:'',error:String(error.message||error)};
  }
  let balance=0;
  try{balance=await conn.getBalance(session.publicKey,'confirmed')}
  catch(error){
    return {ok:false,refundedLamports:0,signature:'',error:String(error.message||error)};
  }
  if(balance<=0)return {ok:true,refundedLamports:0,signature:'',error:''};

  const owner=new PublicKey(row.owner_address);
  const latest=await conn.getLatestBlockhash('confirmed');

  const probe=new Transaction({
    feePayer:session.publicKey,
    recentBlockhash:latest.blockhash,
  }).add(SystemProgram.transfer({
    fromPubkey:session.publicKey,
    toPubkey:owner,
    lamports:1,
  }));
  let fee=5000;
  try{
    const quote=await conn.getFeeForMessage(probe.compileMessage(),'confirmed');
    if(Number.isFinite(Number(quote?.value))&&Number(quote.value)>0)fee=Number(quote.value);
  }catch{}
  const amount=Math.max(0,balance-fee);
  if(amount<=0){
    return {ok:true,refundedLamports:0,signature:'',error:'Reserve balance is below network fee'};
  }

  const tx=new Transaction({
    feePayer:session.publicKey,
    recentBlockhash:latest.blockhash,
  }).add(SystemProgram.transfer({
    fromPubkey:session.publicKey,
    toPubkey:owner,
    lamports:amount,
  }));
  tx.sign(session);

  try{
    const signature=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
    await conn.confirmTransaction({
      signature,
      blockhash:latest.blockhash,
      lastValidBlockHeight:latest.lastValidBlockHeight,
    },'confirmed');
    return {ok:true,refundedLamports:amount,signature,error:''};
  }catch(error){
    return {ok:false,refundedLamports:0,signature:'',error:String(error.message||error)};
  }
}

// SYNC_V56: Read-only on-chain identity verification. Never infer policy
// revocation from a successful unrelated transaction or from local DB state.
function inspectHistoricalPolicy(info,row){
  if(!info)return {status:'missing',verified:false,revoked:false};
  if(!info.owner.equals(new PublicKey(row.program_id)))
    return {status:'wrong_program',verified:false,revoked:false};
  const b=Buffer.from(info.data||[]);
  const revokedOffset=8+32+32+32+8+8+8+8+8+2+1+1;
  if(b.length<=revokedOffset)return {status:'invalid_layout',verified:false,revoked:false};
  // SYNC_V57_IDENTITY_DIAGNOSTICS
  // V57: Distinguish identity fields without exposing private session material.
  const identity={
    ownerMatches:b.subarray(8,40).equals(new PublicKey(row.owner_address).toBuffer()),
    sessionMatches:b.subarray(40,72).equals(new PublicKey(row.session_public_key).toBuffer()),
    subscriptionHashMatches:b.subarray(72,104).equals(sha256(row.subscription_id)),
  };
  if(!Object.values(identity).every(Boolean)){
    const failed=Object.entries(identity).filter(([,ok])=>!ok).map(([name])=>name);
    return {status:'identity_mismatch',verified:false,revoked:false,
      identity,failedFields:failed};
  }
  if(b[revokedOffset]!==0 && b[revokedOffset]!==1)
    return {status:'invalid_revoke_flag',verified:false,revoked:false};
  return {status:b[revokedOffset]===1?'revoked':'active',verified:true,revoked:b[revokedOffset]===1};
}

export async function getVaultReclaimStatus(db,userId,entityId){
  const row=sessionRow(db,userId,entityId);
  if(!row)return {available:false,required:false,message:'No delegated vault session found'};
  const conn=connection();
  const owner=new PublicKey(row.owner_address);
  const policy=new PublicKey(row.policy_address);
  const vault=new PublicKey(row.vault_address);
  // RPC failures must not be misreported as an absent policy or zero reserve.
  const [policyInfo,assets,reserveLamports]=await Promise.all([
    conn.getAccountInfo(policy,'confirmed'),
    vaultAssets(conn,vault),
    conn.getBalance(new PublicKey(row.session_public_key),'confirmed'),
  ]);
  const policyCheck=inspectHistoricalPolicy(policyInfo,row);
  return {
    available:true,
    required:!!policyInfo||assets.length>0||reserveLamports>0,
    subscriptionId:row.subscription_id,
    entityId:row.entity_id,
    ownerAddress:owner.toBase58(),
    policyAddress:policy.toBase58(),
    vaultAddress:vault.toBase58(),
    policyExists:!!policyInfo,
    policyVerification:policyCheck,
    recoverySafeToRelease:false,
    // Never automatically rebind a historical policy to a recreated subscription.
    requiresOwnerSignedReclaim:policyCheck.status==='active',
    state:String(row.state||''),
    assets:assets.map(publicAsset),
    reserveLamports,
    reserveSol:reserveLamports/1e9,
    nonCustodial:true,
  };
}

export async function prepareVaultReclaim(db,userId,entityId){
  const row=sessionRow(db,userId,entityId);
  if(!row)throw Object.assign(new Error('Delegated vault session not found'),{statusCode:404});
  if(String(row.owner_address)!==String(row.funding_address)){
    throw Object.assign(new Error('Owner wallet does not match the verified funding wallet'),{statusCode:409});
  }

  const conn=connection();
  const owner=new PublicKey(row.owner_address);
  const policy=new PublicKey(row.policy_address);
  const vault=new PublicKey(row.vault_address);
  const pid=new PublicKey(row.program_id);

  const [policyInfo,assets]=await Promise.all([
    conn.getAccountInfo(policy,'confirmed').catch(()=>null),
    vaultAssets(conn,vault),
  ]);

  const policyCheck=inspectHistoricalPolicy(policyInfo,row);
  if(policyInfo && !policyCheck.verified){
    const details=policyCheck.failedFields?.length
      ? ` [${policyCheck.failedFields.join(', ')}]` : '';
    throw Object.assign(new Error(`Historical on-chain policy verification failed: ${policyCheck.status}${details}; no transaction prepared`),{statusCode:409});
  }
  if(policyCheck.revoked && assets.length>0){
    throw Object.assign(new Error('Historical policy is already revoked while vault holds funds; automatic reclaim stopped'),{statusCode:409});
  }

  if(assets.length>0 && (!policyInfo || !policyInfo.owner.equals(pid))){
    throw Object.assign(
      new Error('Vault contains funds but the delegated policy is not active. Automatic reclaim is stopped for safety.'),
      {statusCode:409}
    );
  }

  if(!policyInfo && assets.length===0){
    return {
      alreadyComplete:true,
      transactions:[],
      ownerAddress:owner.toBase58(),
      vaultAddress:vault.toBase58(),
      assetCount:0,
    };
  }

  const transactions=[];
  const assetResults=[];

  if(assets.length){
    for(let i=0;i<assets.length;i++){
      const asset=assets[i];
      const destination=ataAddress(owner,asset.mint);
      const destinationInfo=await conn.getAccountInfo(destination,'confirmed').catch(()=>null);
      const tx=new Transaction();

      if(!destinationInfo){
        tx.add(createAtaIdempotentIx(owner,owner,asset.mint,destination));
      }

      tx.add(new TransactionInstruction({
        programId:pid,
        keys:[
          {pubkey:owner,isSigner:true,isWritable:true},
          {pubkey:policy,isSigner:false,isWritable:true},
          {pubkey:vault,isSigner:false,isWritable:true},
          {pubkey:asset.tokenAccount,isSigner:false,isWritable:true},
          {pubkey:destination,isSigner:false,isWritable:true},
          {pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
        ],
        data:Buffer.concat([WITHDRAW_TOKEN_DISC,u64(asset.amountRaw)]),
      }));

      const unwrapToSol=asset.mint.equals(WSOL_MINT)&&!destinationInfo;
      if(unwrapToSol){
        tx.add(closeTokenAccountIx(destination,owner,owner));
      }

      if(i===assets.length-1 && policyInfo){
        tx.add(new TransactionInstruction({
          programId:pid,
          keys:[
            {pubkey:owner,isSigner:true,isWritable:false},
            {pubkey:policy,isSigner:false,isWritable:true},
          ],
          data:REVOKE_DISC,
        }));
      }

      const latest=await conn.getLatestBlockhash('confirmed');
      tx.feePayer=owner;
      tx.recentBlockhash=latest.blockhash;
      transactions.push({
        transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),
        label:asset.mint.equals(WSOL_MINT)?(unwrapToSol?'Return SOL':'Return WSOL'):'Return token',
        mint:asset.mint.toBase58(),
        amountRaw:asset.amountRaw.toString(),
        uiAmount:asset.uiAmount,
        unwrapToSol,
      });
      assetResults.push({...publicAsset(asset),destination:destination.toBase58(),unwrapToSol});
    }
  }else if(policyInfo){
    const tx=new Transaction();
    tx.add(new TransactionInstruction({
      programId:pid,
      keys:[
        {pubkey:owner,isSigner:true,isWritable:false},
        {pubkey:policy,isSigner:false,isWritable:true},
      ],
      data:REVOKE_DISC,
    }));
    const latest=await conn.getLatestBlockhash('confirmed');
    tx.feePayer=owner;
    tx.recentBlockhash=latest.blockhash;
    transactions.push({
      transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),
      label:'Revoke 24/7 policy',
      mint:'',
      amountRaw:'0',
      uiAmount:'0',
      unwrapToSol:false,
    });
  }

  return {
    alreadyComplete:false,
    ownerAddress:owner.toBase58(),
    vaultAddress:vault.toBase58(),
    policyAddress:policy.toBase58(),
    assetCount:assetResults.length,
    assets:assetResults,
    transactions,
  };
}

export async function confirmVaultReclaim(db,userId,entityId,signatures=[]){
  const row=sessionRow(db,userId,entityId);
  if(!row)throw Object.assign(new Error('Delegated vault session not found'),{statusCode:404});
  const conn=connection();

  const sigs=[...new Set((Array.isArray(signatures)?signatures:[])
    .map(v=>String(v||'').trim()).filter(Boolean))];
  // V45: A confirmed signature alone is NOT evidence of an owner-authorized reclaim.
  // Verify every signature references this policy/program and includes the owner signer.
  if(sigs.length===0){
    throw Object.assign(new Error('Owner-signed reclaim transaction required'),{statusCode:409});
  }
  for(const sig of sigs){
    await waitForSignature(conn,sig);
    const tx=await conn.getTransaction(sig,{commitment:'confirmed',maxSupportedTransactionVersion:0});
    if(!tx||tx.meta?.err){
      throw Object.assign(new Error('Reclaim transaction could not be verified'),{statusCode:409});
    }
    const message=tx.transaction.message;
    const keys=message.staticAccountKeys||message.accountKeys||[];
    const keyStrings=keys.map(k=>k.toBase58());
    const ownerIndex=keyStrings.indexOf(row.owner_address);
    if(ownerIndex<0||ownerIndex>=message.header.numRequiredSignatures){
      throw Object.assign(new Error('Reclaim owner signature is missing'),{statusCode:409});
    }
    const programIndex=keyStrings.indexOf(row.program_id);
    const policyIndex=keyStrings.indexOf(row.policy_address);
    if(programIndex<0||policyIndex<0){
      throw Object.assign(new Error('Reclaim policy or program does not match'),{statusCode:409});
    }
    const instructions=message.compiledInstructions||message.instructions||[];
    const matched=instructions.some(ix=>{
      const program=ix.programIdIndex;
      const accounts=ix.accountKeyIndexes||ix.accounts||[];
      if(program!==programIndex||!accounts.includes(policyIndex))return false;
      // V46: Solana RPC returns compiled instruction data as base58 strings.
      // Reject malformed encodings instead of treating them as empty bytes.
      let data;
      try { data=typeof ix.data==='string'?decodeBase58(ix.data):Buffer.from(ix.data||[]); }
      catch { return false; }
      return data.length>=8&&(data.subarray(0,8).equals(WITHDRAW_TOKEN_DISC)||data.subarray(0,8).equals(REVOKE_DISC));
    });
    if(!matched){
      throw Object.assign(new Error('Signature does not contain a valid reclaim instruction'),{statusCode:409});
    }
  }

  // V50: A successful withdrawal is not proof of policy revocation.
  // Never release the historical session slot or refund the session signer
  // while the deployed policy can still authorize execution.
  const policyInfo=await conn.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
  if(policyInfo){
    if(!policyInfo.owner.equals(new PublicKey(row.program_id))){
      throw Object.assign(new Error('On-chain policy is owned by an unexpected program; manual recovery required'),{statusCode:409});
    }
    // Anchor policy account layout: discriminator(8), owner(32), session(32),
    // subscription hash(32), caps(8+8), max sell(2), flags(2), expires(8), revoked(1).
    // Do not assume offsets here: confirm the revoke instruction itself succeeded
    // AND was included in the owner-signed confirmed transaction.
    let sawRevoke=false;
    for(const sig of sigs){
      const tx=await conn.getTransaction(sig,{commitment:'confirmed',maxSupportedTransactionVersion:0});
      if(!tx||tx.meta?.err)continue;
      const m=tx.transaction.message;
      const keys=(m.staticAccountKeys||m.accountKeys||[]).map(k=>k.toBase58());
      const pi=keys.indexOf(row.program_id), ai=keys.indexOf(row.policy_address);
      const oi=keys.indexOf(row.owner_address);
      if(pi<0||ai<0||oi<0||oi>=m.header.numRequiredSignatures)continue;
      for(const ix of m.compiledInstructions||m.instructions||[]){
        if(ix.programIdIndex!==pi||!(ix.accountKeyIndexes||ix.accounts||[]).includes(ai))continue;
        let data;
        try{data=typeof ix.data==='string'?decodeBase58(ix.data):Buffer.from(ix.data||[])}catch{continue}
        if(data.length===8&&data.equals(REVOKE_DISC))sawRevoke=true;
      }
    }
    if(!sawRevoke){
      throw Object.assign(new Error('Confirmed owner-signed revoke_session instruction required before local session release'),{statusCode:409});
    }
    // V51: A revoke instruction in a successful transaction is not sufficient
    // by itself. Verify the *current* on-chain policy is revoked and belongs
    // to the historical owner, signer and subscription before local release.
    const data=Buffer.from(policyInfo.data||[]);
    // Anchor discriminator(8), owner(32), session(32), subscription hash(32),
    // expires(8), trade cap(8), daily cap(8), spent(8), day index(8),
    // sell bps(2), copy buys(1), copy sells(1), revoked(1).
    const revokedOffset=8+32+32+32+8+8+8+8+8+2+1+1;
    const expectedHash=sha256(row.subscription_id);
    if(data.length<=revokedOffset ||
       !data.subarray(8,40).equals(new PublicKey(row.owner_address).toBuffer()) ||
       !data.subarray(40,72).equals(new PublicKey(row.session_public_key).toBuffer()) ||
       !data.subarray(72,104).equals(expectedHash) ||
       data[revokedOffset]!==1){
      throw Object.assign(new Error('On-chain policy is not verified as revoked for this historical session; local release blocked'),{statusCode:409});
    }
  }
  const vault=new PublicKey(row.vault_address);
  const remaining=await vaultAssets(conn,vault);
  if(remaining.length){
    const total=remaining.map(a=>`${a.uiAmount} ${a.mint.toBase58()}`).join(', ');
    throw Object.assign(new Error(`Vault still contains token balance after reclaim: ${total}`),{statusCode:409});
  }

  const at=new Date().toISOString();
  db.prepare(`
    UPDATE delegated_copy_sessions
    SET state='revoked',revoked_at=?,auth_token_hash='',auth_token_expires_at='',
        last_error='',updated_at=?
    WHERE subscription_id=?
  `).run(at,at,row.subscription_id);

  db.prepare(`
    UPDATE copy_subscriptions
    SET enabled=0,engine_state='stopped',last_error='',updated_at=?
    WHERE id=? AND user_id=?
  `).run(at,row.subscription_id,userId);

  const reserveRefund=await refundSessionReserve(conn,row);

  // V55: The (user_id, entity_id) unique session slot must not remain
  // occupied forever after a verified owner-signed reclaim. Preserve the
  // historical session verbatim in an audit table before releasing the slot.
  // Never release if the session-signing fee reserve still needs recovery.
  if(!reserveRefund.ok){
    return {ok:true,reclaimed:true,sessionReleased:false,
      message:'Vault reclaimed, but session fee reserve refund is pending. Historical session retained.',
      ownerAddress:row.owner_address,vaultAddress:row.vault_address,
      signatures:sigs,reserveRefund};
  }
  db.exec(`CREATE TABLE IF NOT EXISTS delegated_copy_reclaimed_archive (
    subscription_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    record_json TEXT NOT NULL,
    reclaimed_at TEXT NOT NULL
  )`);
  const release=db.transaction(()=>{
    const current=db.prepare('SELECT * FROM delegated_copy_sessions WHERE subscription_id=?').get(row.subscription_id);
    if(!current || current.state!=='revoked' || !current.revoked_at ||
       current.owner_address!==row.owner_address || current.vault_address!==row.vault_address){
      throw new Error('Historical session changed during reclaim; slot not released');
    }
    db.prepare(`INSERT INTO delegated_copy_reclaimed_archive
      (subscription_id,user_id,entity_id,record_json,reclaimed_at)
      VALUES (?,?,?,?,?)`).run(current.subscription_id,current.user_id,current.entity_id,
      JSON.stringify(current),at);
    const removed=db.prepare(`DELETE FROM delegated_copy_sessions
      WHERE subscription_id=? AND state='revoked' AND revoked_at<>''`).run(current.subscription_id);
    if(removed.changes!==1)throw new Error('Session slot release failed');
  });
  release();

  return {
    ok:true,
    sessionReleased:true,
    reclaimed:true,
    ownerAddress:row.owner_address,
    vaultAddress:row.vault_address,
    signatures:sigs,
    reserveRefund,
  };
}
