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

export async function getVaultReclaimStatus(db,userId,entityId){
  const row=sessionRow(db,userId,entityId);
  if(!row)return {available:false,required:false,message:'No delegated vault session found'};
  const conn=connection();
  const owner=new PublicKey(row.owner_address);
  const policy=new PublicKey(row.policy_address);
  const vault=new PublicKey(row.vault_address);
  const [policyInfo,assets,reserveLamports]=await Promise.all([
    conn.getAccountInfo(policy,'confirmed').catch(()=>null),
    vaultAssets(conn,vault),
    conn.getBalance(new PublicKey(row.session_public_key),'confirmed').catch(()=>0),
  ]);
  return {
    available:true,
    required:!!policyInfo||assets.length>0||reserveLamports>0,
    subscriptionId:row.subscription_id,
    entityId:row.entity_id,
    ownerAddress:owner.toBase58(),
    policyAddress:policy.toBase58(),
    vaultAddress:vault.toBase58(),
    policyExists:!!policyInfo,
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
  for(const sig of sigs)await waitForSignature(conn,sig);

  // V41: Do not mark an existing policy revoked based on an empty vault alone.
  // Confirmation must contain an owner-submitted signature when policy exists.
  const policyInfo=await conn.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
  if(policyInfo && sigs.length===0){
    throw Object.assign(new Error('Owner-signed reclaim confirmation required'),{statusCode:409});
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

  return {
    ok:true,
    reclaimed:true,
    ownerAddress:row.owner_address,
    vaultAddress:row.vault_address,
    signatures:sigs,
    reserveRefund,
  };
}
