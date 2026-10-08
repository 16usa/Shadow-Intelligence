import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
const file=process.env.DB_PATH||'./shadow-intelligence.db';
if(!fs.existsSync(file)){console.log('DB_NOT_FOUND: Check DB_PATH (do not create a new database).');process.exit(2)}
const db=new DatabaseSync(file,{readOnly:true});
const table=n=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(n);
for(const n of ['copy_subscriptions','delegated_copy_sessions','user_wallets'])if(!table(n)){console.log('MISSING_TABLE '+n);process.exit(2)}
const subs=db.prepare(`SELECT s.id,s.user_id,s.entity_id,s.user_wallet_id,s.enabled,s.engine_state,s.last_error,uw.address AS wallet FROM copy_subscriptions s LEFT JOIN user_wallets uw ON uw.id=s.user_wallet_id ORDER BY s.updated_at DESC LIMIT 15`).all();
const rows=db.prepare(`SELECT subscription_id,user_id,entity_id,funding_wallet_id,owner_address,session_public_key,policy_address,vault_address,program_id,state,authorized_at,revoked_at FROM delegated_copy_sessions`).all();
const short=x=>x?String(x).slice(0,7)+'…'+String(x).slice(-5):'(none)';
console.log('SYNC V38 READ-ONLY DIAGNOSTIC; no keys, tokens, or full wallet addresses printed');
console.log('SUBSCRIPTIONS',subs.length,'SESSIONS',rows.length);
for(const s of subs){const matches=rows.filter(d=>d.user_id===s.user_id&&d.entity_id===s.entity_id);console.log(JSON.stringify({subscription:short(s.id),engineState:s.engine_state,enabled:!!s.enabled,lastErrorCode:s.last_error?.slice(0,90)||'',walletPresent:!!s.wallet,sessionCount:matches.length,sessions:matches.map(d=>({subscription:short(d.subscription_id),exact:d.subscription_id===s.id,ownerMatches:d.owner_address===s.wallet,walletIdMatches:d.funding_wallet_id===s.user_wallet_id,hasPolicy:!!d.policy_address,hasVault:!!d.vault_address,hasSessionKey:!!d.session_public_key,revoked:!!d.revoked_at,authorized:!!d.authorized_at,state:d.state,programMatchesConfigured:d.program_id===process.env.SHADOW_DELEGATED_PROGRAM_ID}))}));}
db.close();
