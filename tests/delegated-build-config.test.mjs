import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const programId='H2LRaXnCHp5qc2MECPFLuAVWcFwYqQTi1TgJZJT3tDQc';

test('delegated build/security configuration is clean',()=>{
  const replit=read('.replit');
  assert.equal(/SHADOW_(?:EXECUTION|SESSION)_MASTER_KEY\s*=/.test(replit),false);

  const engine=read('src/internal-copy-engine.mjs');
  assert.match(engine,/const raw=text\(process\.env\.SHADOW_SESSION_MASTER_KEY\);/);
  assert.equal(engine.includes('process.env.SHADOW_EXECUTION_MASTER_KEY'),false);

  const cargo=read('solana/shadow-delegated-vault/programs/shadow_delegated_vault/Cargo.toml');
  assert.match(cargo,/anchor-lang = "=0\.30\.1"/);
  assert.match(cargo,/anchor-spl = \{ version = "=0\.30\.1", default-features = false, features = \["token"\] \}/);
  assert.match(cargo,/solana-program = "=1\.18\.17"/);
  assert.equal(cargo.includes('indexmap'),false);

  const lib=read('solana/shadow-delegated-vault/programs/shadow_delegated_vault/src/lib.rs');
  assert.match(lib,new RegExp(`declare_id!\\("${programId}"\\)`));
  assert.match(lib,/let policy_key=ctx\.accounts\.policy\.key\(\);/);
  assert.match(lib,/let vault_bump=\[p\.vault_bump\];/);

  const anchor=read('solana/shadow-delegated-vault/Anchor.toml');
  assert.equal((anchor.match(new RegExp(programId,'g'))||[]).length,2);
});
