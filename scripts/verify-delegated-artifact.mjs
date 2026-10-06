/* SHADOW_REPLIT_ONLY_ARTIFACT_VERIFY_V372 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const configured=String(process.env.SHADOW_DELEGATED_SBF_PATH||'').trim();
const artifactPath=configured
  ?(path.isAbsolute(configured)?configured:path.resolve(root,configured))
  :path.join(root,'solana','shadow-delegated-vault','target','deploy','shadow_delegated_vault.so');

console.log(`SHADOW_DELEGATED_ARTIFACT_PATH=${artifactPath}`);
console.log('SHADOW_DELEGATED_CI_REQUIRED=false');

if(!fs.existsSync(artifactPath)){
  console.log('SHADOW_DELEGATED_ARTIFACT_PRESENT=false');
  console.log('SHADOW_DELEGATED_RUNTIME_FAIL_CLOSED=true');
  process.exit(2);
}

const stat=fs.statSync(artifactPath);
if(!stat.isFile()||stat.size<=0){
  console.error('ERROR: delegated artifact path is not a non-empty file');
  process.exit(1);
}

const fd=fs.openSync(artifactPath,'r');
const magic=Buffer.alloc(4);
try{fs.readSync(fd,magic,0,4,0)}finally{fs.closeSync(fd)}
if(!magic.equals(Buffer.from([0x7f,0x45,0x4c,0x46]))){
  console.error('ERROR: delegated artifact is not an ELF .so file');
  process.exit(1);
}

const hash=crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
console.log('SHADOW_DELEGATED_ARTIFACT_PRESENT=true');
console.log(`SHADOW_DELEGATED_ARTIFACT_BYTES=${stat.size}`);
console.log(`SHADOW_DELEGATED_ARTIFACT_SHA256=${hash}`);
console.log('SHADOW_DELEGATED_ARTIFACT_VERIFY_OK');
