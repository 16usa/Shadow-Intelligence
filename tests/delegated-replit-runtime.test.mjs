import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('delegated runtime is Replit-only and CI-independent',()=>{
  assert.equal(fs.existsSync(new URL('.github/workflows/shadow-delegated-build.yml',root)),false);

  const engine=read('src/internal-copy-engine.mjs');
  assert.match(engine,/SHADOW_REPLIT_ONLY_RUNTIME_V372/);
  assert.match(engine,/ciRequired:false/);
  assert.match(engine,/buildTransport:'replit-local-artifact'/);
  assert.match(engine,/artifactRequiredAtRuntime:false/);
  assert.match(engine,/SHADOW_DELEGATED_SBF_PATH/);

  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['delegated:artifact:check'],'node scripts/verify-delegated-artifact.mjs');
  assert.equal(pkg.scripts['delegated:artifact:stage'],'bash scripts/stage-delegated-artifact.sh');

  const building=read('solana/shadow-delegated-vault/BUILDING.md');
  assert.match(building,/no longer depends on GitHub Actions|GitHub Actions is not part of this build path/i);
  assert.match(building,/public mainnet autonomous execution remains fail-closed/i);
});
