import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.mjs';
import { id, nowIso } from './utils.mjs';

export function openDb(path = process.env.DB_PATH || './shadow-intelligence.db') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      x_handle TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      x_handle TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      avatar_source TEXT DEFAULT 'manual',
      risk_score INTEGER NOT NULL DEFAULT 0,
      confidence INTEGER NOT NULL DEFAULT 50,
      incidents INTEGER NOT NULL DEFAULT 0,
      follower_losses REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'watch',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
      address TEXT UNIQUE NOT NULL,
      label TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      avatar_source TEXT DEFAULT 'generated',
      chain TEXT NOT NULL DEFAULT 'solana',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      mint TEXT UNIQUE,
      image TEXT DEFAULT '',
      price_change REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
      wallet_id TEXT REFERENCES wallets(id) ON DELETE SET NULL,
      token_id TEXT REFERENCES tokens(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'info',
      value REAL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      source_url TEXT DEFAULT '',
      image TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS copy_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'watch',
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS copy_group_wallets (
      group_id TEXT NOT NULL REFERENCES copy_groups(id) ON DELETE CASCADE,
      wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, wallet_id)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedSettings(db);
  seedOwner(db);
  seedDemo(db);
  return db;
}

function seedSettings(db) {
  const defaults = {
    platform_name: 'Shadow Intelligence',
    registration_enabled: 'true',
    community_chat_enabled: 'true',
    copy_trading_enabled: 'true',
    risk_high_threshold: '80',
    demo_mode: 'true'
  };
  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) stmt.run(k, v);
}

function seedOwner(db) {
  const email = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.OWNER_PASSWORD || '');
  if (!email || !password) return;
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return;
  db.prepare(`INSERT INTO users (id,email,password_hash,display_name,role,created_at) VALUES (?,?,?,?,?,?)`).run(
    id('usr_'), email, hashPassword(password), process.env.OWNER_NAME || 'Owner', 'owner', nowIso()
  );
}

function seedDemo(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM entities').get().n;
  if (count) return;
  const t = nowIso();
  const entityRows = [
    ['ent_moon','moondev','@moondev','',98,98,24,412000,'high','Repeated promotion → exit pattern'],
    ['ent_degen','degensage','@degensage','',92,94,18,320000,'high','High-risk promoter cluster'],
    ['ent_trade','tradewarrior','@tradewarrior','',87,91,16,280000,'high','Frequent pre-promotion entries'],
    ['ent_maya','blockmaya','@blockmaya','',64,85,9,72000,'watch','Mixed history; monitor'],
    ['ent_pump','pumpking','@pumpking','',76,88,12,118000,'watch','Moderate repeated sell pressure']
  ];
  const eStmt = db.prepare(`INSERT INTO entities (id,name,x_handle,avatar,risk_score,confidence,incidents,follower_losses,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of entityRows) eStmt.run(...r, t);

  const walletRows = [
    ['wal_1','ent_moon','7G3x9L2yT4K8qV2s9Qw2K1m9','Main wallet'],
    ['wal_2','ent_moon','2aB4pQ7cU8nJ3wR6mK1sT2z9','Linked wallet'],
    ['wal_3','ent_degen','9fK3dLm8vQ2sR7xN1pC6jA4t','Main wallet'],
    ['wal_4','ent_trade','5xP8nR4mT2vK7qL9sD1cB6aE','Main wallet']
  ];
  const wStmt = db.prepare(`INSERT INTO wallets (id,entity_id,address,label,created_at) VALUES (?,?,?,?,?)`);
  for (const r of walletRows) wStmt.run(...r, t);

  const tokenRows = [
    ['tok_frog','$FROG','Frog','FROGdemoMint','',12],
    ['tok_mew','$MEW','Mew','MEWdemoMint','',28],
    ['tok_pup','$PUP','Pup','PUPdemoMint','',156],
    ['tok_cat','$CAT','Cat','CATdemoMint','',-36],
    ['tok_rug','$RUG','Rug','RUGdemoMint','',-36]
  ];
  const tokStmt = db.prepare(`INSERT INTO tokens (id,symbol,name,mint,image,price_change,created_at) VALUES (?,?,?,?,?,?,?)`);
  for (const r of tokenRows) tokStmt.run(...r, t);

  const incidentRows = [
    ['inc_1','ent_moon','wal_1','tok_frog','buy','Bought $FROG','Wallet 7G3…K1m9','high',12,-2],
    ['inc_2','ent_degen','wal_3','tok_mew','social','X post detected','“$MEW is the next leg up.”','watch',28,-8],
    ['inc_3','ent_trade','wal_4','tok_pup','inflow','Retail inflow surged','$420K in 5 minutes','high',156,-12],
    ['inc_4','ent_maya',null,'tok_cat','sell','Sold 48% of position','Large exit after social activity','medium',-36,-18],
    ['inc_5','ent_degen','wal_3','tok_rug','drop','Token down -36%','After promoter sell','high',-36,-24]
  ];
  const iStmt = db.prepare(`INSERT INTO incidents (id,entity_id,wallet_id,token_id,type,title,detail,severity,value,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const r of incidentRows) {
    const dt = new Date(Date.now() + r[9]*60000).toISOString();
    iStmt.run(...r.slice(0,9), dt);
  }

  db.prepare(`INSERT INTO copy_groups (id,name,mode,enabled,created_at) VALUES (?,?,?,?,?)`).run('grp_smart','Smart Money','copy',1,t);
  db.prepare(`INSERT INTO copy_groups (id,name,mode,enabled,created_at) VALUES (?,?,?,?,?)`).run('grp_watch','Watchlist','watch',1,t);
  db.prepare(`INSERT INTO copy_groups (id,name,mode,enabled,created_at) VALUES (?,?,?,?,?)`).run('grp_risk','High Risk Promoters','inverse',0,t);
  db.prepare(`INSERT INTO copy_group_wallets (group_id,wallet_id) VALUES (?,?)`).run('grp_smart','wal_1');
  db.prepare(`INSERT INTO copy_group_wallets (group_id,wallet_id) VALUES (?,?)`).run('grp_watch','wal_3');
  db.prepare(`INSERT INTO copy_group_wallets (group_id,wallet_id) VALUES (?,?)`).run('grp_risk','wal_4');
}

export function getSetting(db, key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

export function getAllSettings(db) {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings ORDER BY key').all().map(r => [r.key, r.value]));
}
