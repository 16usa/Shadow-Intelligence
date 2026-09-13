#!/usr/bin/env bash
set -u
cd "${HOME}/workspace" || exit 1

echo "=== SHADOW 3D DATA DIAGNOSTIC ==="
echo
echo "PWD: $PWD"
echo "DB_PATH: ${DB_PATH:-<not set>}"
echo

echo "=== SQLITE FILES ==="
find "$HOME/workspace" -maxdepth 4 -type f \( -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" \) -print 2>/dev/null || true
echo

echo "=== DATABASE COUNTS ==="
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function walk(dir, depth=0, out=[]){
  if(depth>4) return out;
  let items=[];
  try{ items=fs.readdirSync(dir,{withFileTypes:true}); }catch{return out}
  for(const e of items){
    const p=path.join(dir,e.name);
    if(e.isDirectory() && !['node_modules','.git'].includes(e.name)) walk(p,depth+1,out);
    else if(e.isFile() && /\.(db|sqlite|sqlite3)$/i.test(e.name)) out.push(p);
  }
  return out;
}
const root=process.env.HOME+'/workspace';
const files=walk(root);
if(!files.length) console.log('NO SQLITE DATABASE FILES FOUND');
for(const f of files){
  try{
    const db=new DatabaseSync(f,{readOnly:true});
    const has=(n)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n);
    const count=(n)=>has(n)?db.prepare(`SELECT COUNT(*) n FROM ${n}`).get().n:'-';
    console.log('\n'+f);
    console.log('  entities:',count('entities'));
    console.log('  wallets :',count('wallets'));
    console.log('  tokens  :',count('tokens'));
    console.log('  chat    :',count('chat_messages'));
    db.close();
  }catch(e){ console.log('\n'+f+'\n  ERROR: '+e.message); }
}
NODE

echo
echo "=== LOCAL API ==="
for ep in entities tokens overview; do
  echo
  echo "--- /api/$ep ---"
  curl -sS --max-time 8 -w "\nHTTP %{http_code}  total=%{time_total}s\n" "http://127.0.0.1:3000/api/$ep" | head -c 3000
  echo
done

echo
echo "=== DONE ==="
