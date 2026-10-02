/* SHADOW_EXECUTION_WALLET_24X7_V320 */

const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();

export function ensureExecutionWalletSchema(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_wallet_authorizations (
      subscription_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      funding_wallet_id TEXT NOT NULL,
      execution_address TEXT NOT NULL DEFAULT '',
      execution_kind TEXT NOT NULL DEFAULT 'dedicated_wallet',
      authorization_state TEXT NOT NULL DEFAULT 'not_authorized',
      authorization_url TEXT NOT NULL DEFAULT '',
      funding_url TEXT NOT NULL DEFAULT '',
      authorization_expires_at TEXT NOT NULL DEFAULT '',
      engine_session_id TEXT NOT NULL DEFAULT '',
      armed_at TEXT NOT NULL DEFAULT '',
      last_sync_at TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id,entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_execution_wallet_auth_user
      ON execution_wallet_authorizations(user_id,updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_execution_wallet_auth_entity
      ON execution_wallet_authorizations(entity_id,updated_at DESC);
  `);
}

export function mainCopyWalletRows(db,entityId){
  // Trading authority is Main Wallet only. Auto-discovered linked wallets live
  // outside this table in current Shadow builds; if legacy extra rows exist,
  // prefer an explicit Main Wallet label and otherwise the oldest entity wallet.
  const row=db.prepare(`
    SELECT * FROM wallets
    WHERE entity_id=?
    ORDER BY
      CASE WHEN lower(trim(COALESCE(label,'')))='main wallet' THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1
  `).get(entityId);
  return row?[row]:[];
}

export function engineExecutionSnapshot(engine){
  const data=engine?.data&&typeof engine.data==='object'
    ? engine.data
    : (engine&&typeof engine==='object'?engine:{});
  const wallet=data?.executionWallet&&typeof data.executionWallet==='object'
    ? data.executionWallet
    : {};
  const address=text(
    wallet.address ||
    data.executionWalletAddress ||
    data.vaultAddress ||
    data.executionAddress
  );
  const kind=text(
    wallet.kind ||
    wallet.type ||
    data.executionWalletKind ||
    data.executionMode ||
    'dedicated_wallet'
  );
  const authorizationUrl=text(engine?.authorizationUrl || data.authorizationUrl);
  const fundingUrl=text(wallet.fundingUrl || data.fundingUrl);
  const expiresAt=text(
    wallet.authorizationExpiresAt ||
    data.authorizationExpiresAt ||
    data.expiresAt
  );
  const sessionId=text(wallet.sessionId || data.engineSessionId || data.sessionId);
  const engineActive=engine?.active===true;
  const dedicatedReady=engineActive&&!!address;
  const reportedState=text(wallet.status || data.authorizationState || data.state || engine?.authorizationState).toLowerCase();
  let state='pending';
  if(dedicatedReady)state='armed';
  else if(authorizationUrl)state='authorization_required';
  else if(engineActive&&!address)state='execution_wallet_required';
  else if(['revoked','removed','disabled','stopped'].includes(reportedState))state='revoked';
  else if(reportedState)state=reportedState;
  return {
    engineActive,
    dedicatedReady,
    address,
    kind,
    state,
    authorizationUrl,
    fundingUrl,
    authorizationExpiresAt:expiresAt,
    sessionId
  };
}

export function executionAuthorizationRow(db,userId,entityId){
  ensureExecutionWalletSchema(db);
  const r=db.prepare(`
    SELECT * FROM execution_wallet_authorizations
    WHERE user_id=? AND entity_id=?
  `).get(userId,entityId);
  if(!r)return null;
  return {
    subscriptionId:r.subscription_id,
    userId:r.user_id,
    entityId:r.entity_id,
    fundingWalletId:r.funding_wallet_id,
    address:r.execution_address,
    kind:r.execution_kind,
    authorizationState:r.authorization_state,
    authorizationUrl:r.authorization_url,
    fundingUrl:r.funding_url,
    authorizationExpiresAt:r.authorization_expires_at,
    engineSessionId:r.engine_session_id,
    armedAt:r.armed_at,
    lastSyncAt:r.last_sync_at,
    lastError:r.last_error,
    updatedAt:r.updated_at
  };
}

export function persistExecutionAuthorization(db,{subscription,userId,entityId,fundingWalletId,engine,error=''}){
  ensureExecutionWalletSchema(db);
  const snap=engineExecutionSnapshot(engine);
  const prev=db.prepare(`
    SELECT * FROM execution_wallet_authorizations
    WHERE user_id=? AND entity_id=?
  `).get(userId,entityId);
  const at=now();
  const armedAt=snap.dedicatedReady?(prev?.armed_at||at):'';
  db.prepare(`
    INSERT INTO execution_wallet_authorizations
      (subscription_id,user_id,entity_id,funding_wallet_id,execution_address,
       execution_kind,authorization_state,authorization_url,funding_url,
       authorization_expires_at,engine_session_id,armed_at,last_sync_at,
       last_error,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,entity_id) DO UPDATE SET
      subscription_id=excluded.subscription_id,
      funding_wallet_id=excluded.funding_wallet_id,
      execution_address=excluded.execution_address,
      execution_kind=excluded.execution_kind,
      authorization_state=excluded.authorization_state,
      authorization_url=excluded.authorization_url,
      funding_url=excluded.funding_url,
      authorization_expires_at=excluded.authorization_expires_at,
      engine_session_id=excluded.engine_session_id,
      armed_at=excluded.armed_at,
      last_sync_at=excluded.last_sync_at,
      last_error=excluded.last_error,
      updated_at=excluded.updated_at
  `).run(
    subscription.id,userId,entityId,fundingWalletId,
    snap.address,snap.kind,snap.state,snap.authorizationUrl,snap.fundingUrl,
    snap.authorizationExpiresAt,snap.sessionId,armedAt,at,text(error).slice(0,500),
    prev?.created_at||at,at
  );
  return executionAuthorizationRow(db,userId,entityId);
}

export function markExecutionAuthorizationError(db,{subscription,userId,entityId,fundingWalletId,error}){
  ensureExecutionWalletSchema(db);
  const prev=executionAuthorizationRow(db,userId,entityId);
  const at=now();
  db.prepare(`
    INSERT INTO execution_wallet_authorizations
      (subscription_id,user_id,entity_id,funding_wallet_id,execution_address,
       execution_kind,authorization_state,authorization_url,funding_url,
       authorization_expires_at,engine_session_id,armed_at,last_sync_at,
       last_error,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,entity_id) DO UPDATE SET
      authorization_state='error',last_sync_at=excluded.last_sync_at,
      last_error=excluded.last_error,updated_at=excluded.updated_at
  `).run(
    subscription.id,userId,entityId,fundingWalletId,
    prev?.address||'',prev?.kind||'noncustodial_delegated_vault','error',
    prev?.authorizationUrl||'',prev?.fundingUrl||'',prev?.authorizationExpiresAt||'',
    prev?.engineSessionId||'',prev?.armedAt||'',at,text(error).slice(0,500),at,at
  );
  return executionAuthorizationRow(db,userId,entityId);
}

export function clearExecutionAuthorization(db,userId,entityId){
  ensureExecutionWalletSchema(db);
  db.prepare('DELETE FROM execution_wallet_authorizations WHERE user_id=? AND entity_id=?')
    .run(userId,entityId);
}
