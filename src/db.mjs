import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.mjs';
import { id, nowIso } from './utils.mjs';

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
}
function addColumn(db, table, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!tableColumns(db,table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export function openDb(path = process.env.DB_PATH || './shadow-intelligence.db') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',avatar TEXT DEFAULT '',bio TEXT DEFAULT '',x_handle TEXT DEFAULT '',created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,name TEXT NOT NULL,x_handle TEXT DEFAULT '',avatar TEXT DEFAULT '',avatar_source TEXT DEFAULT 'manual',
      risk_score INTEGER NOT NULL DEFAULT 0,confidence INTEGER NOT NULL DEFAULT 50,incidents INTEGER NOT NULL DEFAULT 0,
      follower_losses REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'watch',notes TEXT DEFAULT '',created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,address TEXT UNIQUE NOT NULL,label TEXT DEFAULT '',
      avatar TEXT DEFAULT '',avatar_source TEXT DEFAULT 'generated',chain TEXT NOT NULL DEFAULT 'solana',created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,symbol TEXT NOT NULL,name TEXT NOT NULL,mint TEXT UNIQUE,image TEXT DEFAULT '',price_change REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,wallet_id TEXT REFERENCES wallets(id) ON DELETE SET NULL,
      token_id TEXT REFERENCES tokens(id) ON DELETE SET NULL,type TEXT NOT NULL,title TEXT NOT NULL,detail TEXT DEFAULT '',severity TEXT NOT NULL DEFAULT 'info',
      value REAL,created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE SET NULL,entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
      title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'note',source_url TEXT DEFAULT '',image TEXT DEFAULT '',note TEXT DEFAULT '',created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS copy_groups (id TEXT PRIMARY KEY,name TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'watch',enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS copy_group_wallets (group_id TEXT NOT NULL REFERENCES copy_groups(id) ON DELETE CASCADE,wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,PRIMARY KEY (group_id,wallet_id));
    CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
    CREATE TABLE IF NOT EXISTS direct_messages (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wallet_activity (
      id TEXT PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,signature TEXT NOT NULL,slot INTEGER DEFAULT 0,block_time TEXT,
      type TEXT NOT NULL,source TEXT DEFAULT 'solana',description TEXT DEFAULT '',mint TEXT DEFAULT '',token_symbol TEXT DEFAULT '',token_name TEXT DEFAULT '',
      token_amount REAL DEFAULT 0,sol_amount REAL DEFAULT 0,price_usd REAL DEFAULT 0,price_change REAL DEFAULT 0,is_pump INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_activity_wallet_time ON wallet_activity(wallet_id,block_time DESC);
    CREATE INDEX IF NOT EXISTS idx_wallet_activity_entity_mint_time ON wallet_activity(entity_id,mint,block_time);
    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,external_id TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL DEFAULT 'x',text TEXT NOT NULL,url TEXT DEFAULT '',token_mint TEXT DEFAULT '',token_symbol TEXT DEFAULT '',posted_at TEXT NOT NULL,created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_social_posts_entity_time ON social_posts(entity_id,posted_at DESC);
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id TEXT PRIMARY KEY,token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,price_usd REAL DEFAULT 0,price_change REAL DEFAULT 0,
      market_cap REAL DEFAULT 0,liquidity_usd REAL DEFAULT 0,created_at TEXT NOT NULL
    );
  `);

  migrateColumns(db);
  seedSettings(db);
  migrateFromDemoToLive(db);
  migrateActivityNormalizerV05(db);
  seedOwner(db);
  if (getSetting(db,'demo_mode','false') === 'true') seedDemo(db);
  return db;
}

function migrateColumns(db) {
  addColumn(db,'wallets',"last_signature TEXT DEFAULT ''");
  addColumn(db,'wallets',"last_scanned_at TEXT DEFAULT ''");
  addColumn(db,'wallets',"sync_status TEXT DEFAULT 'pending'");
  addColumn(db,'wallets',"sync_error TEXT DEFAULT ''");
  addColumn(db,'wallets',"monitoring_enabled INTEGER NOT NULL DEFAULT 1");
  addColumn(db,'entities',"x_user_id TEXT DEFAULT ''");
  addColumn(db,'entities',"x_last_post_id TEXT DEFAULT ''");
  addColumn(db,'entities',"x_last_synced_at TEXT DEFAULT ''");
  addColumn(db,'tokens',"price_usd REAL DEFAULT 0");
  addColumn(db,'tokens',"market_cap REAL DEFAULT 0");
  addColumn(db,'tokens',"liquidity_usd REAL DEFAULT 0");
  addColumn(db,'tokens',"dex_id TEXT DEFAULT ''");
  addColumn(db,'tokens',"external_url TEXT DEFAULT ''");
  addColumn(db,'tokens',"last_market_at TEXT DEFAULT ''");
  addColumn(db,'tokens',"is_pump INTEGER NOT NULL DEFAULT 0");
  addColumn(db,'incidents',"source_key TEXT DEFAULT ''");
  addColumn(db,'evidence',"observed_at TEXT DEFAULT ''");
  addColumn(db,'evidence',"token_mint TEXT DEFAULT ''");
  addColumn(db,'evidence',"token_symbol TEXT DEFAULT ''");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_source_key ON incidents(source_key) WHERE source_key <> '';");
}

function seedSettings(db) {
  const defaults = {
    platform_name:'Shadow Intelligence', registration_enabled:'true', community_chat_enabled:'true', copy_trading_enabled:'true',
    risk_high_threshold:'80', demo_mode:'false', live_monitor_enabled:'true', live_poll_seconds:'60', wallet_history_limit:'30', x_monitor_enabled:'true'
  };
  const stmt=db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  for (const [k,v] of Object.entries(defaults)) stmt.run(k,v);
}

function migrateFromDemoToLive(db) {
  if (getSetting(db,'live_mode_migrated_v04','false') === 'true') return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("DELETE FROM incidents WHERE id IN ('inc_1','inc_2','inc_3','inc_4','inc_5')").run();
    db.prepare("DELETE FROM copy_group_wallets WHERE wallet_id IN ('wal_1','wal_2','wal_3','wal_4')").run();
    db.prepare("DELETE FROM wallets WHERE id IN ('wal_1','wal_2','wal_3','wal_4')").run();
    db.prepare("DELETE FROM entities WHERE id IN ('ent_moon','ent_degen','ent_trade','ent_maya','ent_pump')").run();
    db.prepare("DELETE FROM tokens WHERE id IN ('tok_frog','tok_mew','tok_pup','tok_cat','tok_rug')").run();
    db.prepare("DELETE FROM copy_groups WHERE id IN ('grp_smart','grp_watch','grp_risk')").run();
    db.prepare("INSERT INTO settings(key,value) VALUES('demo_mode','false') ON CONFLICT(key) DO UPDATE SET value='false'").run();
    db.prepare("INSERT INTO settings(key,value) VALUES('live_mode_migrated_v04','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function migrateActivityNormalizerV05(db) {
  if (getSetting(db,'activity_normalizer_v05','false') === 'true') return;
  db.exec('BEGIN IMMEDIATE');
  try {
    // v0.4 stored one UI activity row per token transfer leg. Keep an audit copy,
    // then rebuild the live view from the source with the transaction-level normalizer.
    db.exec('CREATE TABLE IF NOT EXISTS wallet_activity_v04_archive AS SELECT * FROM wallet_activity WHERE 0;');
    db.exec('INSERT INTO wallet_activity_v04_archive SELECT * FROM wallet_activity;');
    db.prepare("DELETE FROM incidents WHERE source_key LIKE 'chain:%' OR type='correlation'").run();
    db.prepare('DELETE FROM wallet_activity').run();
    db.prepare("UPDATE wallets SET last_signature='',sync_status='pending',sync_error=''").run();
    db.prepare("UPDATE entities SET risk_score=0,status='monitoring',incidents=(SELECT COUNT(*) FROM incidents i WHERE i.entity_id=entities.id)").run();
    db.prepare("INSERT INTO settings(key,value) VALUES('activity_normalizer_v05','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function seedOwner(db) {
  const email=String(process.env.OWNER_EMAIL||'').trim().toLowerCase(); const password=String(process.env.OWNER_PASSWORD||'');
  if(!email||!password||db.prepare('SELECT id FROM users WHERE email=?').get(email))return;
  db.prepare('INSERT INTO users (id,email,password_hash,display_name,role,created_at) VALUES (?,?,?,?,?,?)').run(id('usr_'),email,hashPassword(password),process.env.OWNER_NAME||'Owner','owner',nowIso());
}

function seedDemo(db) {
  const count=db.prepare('SELECT COUNT(*) AS n FROM entities').get().n; if(count)return;
  const t=nowIso();
  const eStmt=db.prepare('INSERT INTO entities (id,name,x_handle,avatar,risk_score,confidence,incidents,follower_losses,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  for(const r of [
    ['ent_moon','moondev','@moondev','',98,98,24,412000,'high','Demo profile'],
    ['ent_degen','degensage','@degensage','',92,94,18,320000,'high','Demo profile']
  ]) eStmt.run(...r,t);
}

export function getSetting(db,key,fallback=''){return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value??fallback;}
export function getAllSettings(db){return Object.fromEntries(db.prepare('SELECT key,value FROM settings ORDER BY key').all().map(r=>[r.key,r.value]));}
