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
    /* SHADOW_USER_COPY_TRADING_V230_DB */
    CREATE TABLE IF NOT EXISTS user_wallets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'solana',
      verified_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id,address)
    );
    CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS wallet_connect_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      message TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_challenges_user ON wallet_connect_challenges(user_id,created_at DESC);

    /* SHADOW_WALLET_AUTH_V235_DB */
    CREATE TABLE IF NOT EXISTS wallet_login_challenges (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      message TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_login_challenges_address
      ON wallet_login_challenges(address,created_at DESC);
    /* SHADOW_WALLET_AUTH_V235_DB_END */

    CREATE TABLE IF NOT EXISTS copy_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_wallet_id TEXT NOT NULL REFERENCES user_wallets(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      amount_sol REAL NOT NULL DEFAULT 0.05,
      max_position_sol REAL NOT NULL DEFAULT 0.5,
      max_daily_sol REAL NOT NULL DEFAULT 1.0,
      slippage_bps INTEGER NOT NULL DEFAULT 500,
      copy_buys INTEGER NOT NULL DEFAULT 1,
      copy_sells INTEGER NOT NULL DEFAULT 1,
      sell_percent INTEGER NOT NULL DEFAULT 100,
      engine_state TEXT NOT NULL DEFAULT 'draft',
      last_error TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id,entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_copy_subscriptions_user ON copy_subscriptions(user_id,enabled,updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_copy_subscriptions_entity ON copy_subscriptions(entity_id,enabled);
    /* SHADOW_USER_COPY_TRADING_V230_DB_END */
    CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
    CREATE TABLE IF NOT EXISTS direct_messages (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TEXT NOT NULL);

    /* SHADOW_NOTIFICATIONS_V240_DB */
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      entities_enabled INTEGER NOT NULL DEFAULT 0,
      tokens_enabled INTEGER NOT NULL DEFAULT 0,
      live_enabled INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_notification_entities (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id,entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_notification_entities_user
      ON user_notification_entities(user_id,entity_id);
    CREATE TABLE IF NOT EXISTS user_notification_tokens (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id,mint)
    );
    CREATE INDEX IF NOT EXISTS idx_user_notification_tokens_user
      ON user_notification_tokens(user_id,mint);
    /* SHADOW_NOTIFICATIONS_V240_DB_END */

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
    /* SHADOW_CURRENT_HOLDINGS_V219_DB */
    CREATE TABLE IF NOT EXISTS wallet_holdings (
      wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
      mint TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      decimals INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (wallet_id,mint)
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_holdings_mint ON wallet_holdings(mint);
    CREATE INDEX IF NOT EXISTS idx_wallet_holdings_entity ON wallet_holdings(entity_id,mint);

    CREATE TABLE IF NOT EXISTS wallet_holdings_state (
      wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
      last_success_at TEXT DEFAULT '',
      last_attempt_at TEXT DEFAULT '',
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_error TEXT DEFAULT ''
    );
    /* SHADOW_CURRENT_HOLDINGS_V219_DB_END */
  `);

  migrateColumns(db);
  seedSettings(db);
  migrateFromDemoToLive(db);
  migrateActivityNormalizerV05(db);
  migrateTradeOnlyActivityV10(db);
  migrateStableQuoteV2413(db);
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
  /* SHADOW_STABLE_QUOTE_V2413_DB */
  addColumn(db,'wallet_activity',"quote_asset TEXT DEFAULT ''");
  addColumn(db,'wallet_activity',"quote_amount REAL DEFAULT 0");
  addColumn(db,'wallet_activity',"trade_usd REAL DEFAULT 0");
  addColumn(db,'wallet_activity',"trade_usd_source TEXT DEFAULT ''");
  /* SHADOW_STABLE_QUOTE_V2413_DB_END */
  addColumn(db,'tokens',"token_created_at TEXT DEFAULT '';");
  addColumn(db,'tokens',"token_age_source TEXT DEFAULT '';");
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

/* SHADOW_TRADE_ONLY_V239_DB */
function migrateTradeOnlyActivityV10(db) {
  if (getSetting(db,'trade_only_activity_v10','false') === 'true') return;
  const at=nowIso();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_activity_transfer_archive_v239
      AS SELECT * FROM wallet_activity WHERE 0
    `);

    db.exec(`
      INSERT INTO wallet_activity_transfer_archive_v239
      SELECT * FROM wallet_activity
      WHERE LOWER(type) IN ('receive','received','send','sent','transfer','transfer_in','transfer_out')
    `);

    db.exec(`
      DELETE FROM incidents
      WHERE LOWER(type) IN ('receive','received','send','sent','transfer','transfer_in','transfer_out')
    `);

    db.exec(`
      DELETE FROM wallet_activity
      WHERE LOWER(type) IN ('receive','received','send','sent','transfer','transfer_in','transfer_out')
    `);

    db.prepare('DELETE FROM wallet_holdings').run();

    db.prepare(`
      INSERT INTO wallet_holdings
        (wallet_id,entity_id,mint,amount,decimals,updated_at)
      SELECT wallet_id,entity_id,mint,
        (
          SUM(CASE WHEN type IN ('buy','swap') THEN ABS(COALESCE(token_amount,0)) ELSE 0 END)
          -
          SUM(CASE WHEN type='sell' THEN ABS(COALESCE(token_amount,0)) ELSE 0 END)
        ) AS amount,
        0,?
      FROM wallet_activity
      WHERE mint<>'' AND type IN ('buy','sell','swap')
      GROUP BY wallet_id,entity_id,mint
      HAVING
        SUM(CASE WHEN type IN ('buy','swap') THEN ABS(COALESCE(token_amount,0)) ELSE 0 END)>1e-12
        AND (
          SUM(CASE WHEN type IN ('buy','swap') THEN ABS(COALESCE(token_amount,0)) ELSE 0 END)
          -
          SUM(CASE WHEN type='sell' THEN ABS(COALESCE(token_amount,0)) ELSE 0 END)
        )>1e-12
    `).run(at);

    db.exec(`
      DELETE FROM tokens
      WHERE NOT EXISTS (
        SELECT 1 FROM wallet_activity a
        WHERE a.mint=tokens.mint AND a.type IN ('buy','sell','swap')
      )
      AND NOT EXISTS (
        SELECT 1 FROM social_posts s WHERE s.token_mint=tokens.mint
      )
      AND NOT EXISTS (
        SELECT 1 FROM evidence e WHERE e.token_mint=tokens.mint
      )
    `);

    db.prepare(`
      UPDATE entities
      SET incidents=(SELECT COUNT(*) FROM incidents i WHERE i.entity_id=entities.id)
    `).run();

    for (const wallet of db.prepare('SELECT id FROM wallets').all()) {
      db.prepare(`
        INSERT INTO wallet_holdings_state
          (wallet_id,last_success_at,last_attempt_at,sync_status,sync_error)
        VALUES (?,?,?,'live','')
        ON CONFLICT(wallet_id) DO UPDATE SET
          last_success_at=excluded.last_success_at,
          last_attempt_at=excluded.last_attempt_at,
          sync_status='live',
          sync_error=''
      `).run(wallet.id,at,at);
    }

    db.prepare(`
      INSERT INTO settings(key,value)
      VALUES('trade_only_activity_v10','true')
      ON CONFLICT(key) DO UPDATE SET value='true'
    `).run();

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
/* SHADOW_TRADE_ONLY_V239_DB_END */


/* SHADOW_STABLE_QUOTE_V2413_MIGRATION */
function migrateStableQuoteV2413(db) {
  if (getSetting(db,'stable_quote_v2413','false') === 'true') return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE wallets
      SET last_signature='',sync_status='pending',sync_error=''
      WHERE monitoring_enabled=1
    `).run();
    db.prepare(`
      INSERT INTO settings(key,value)
      VALUES('stable_quote_v2413','true')
      ON CONFLICT(key) DO UPDATE SET value='true'
    `).run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
/* SHADOW_STABLE_QUOTE_V2413_MIGRATION_END */

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
