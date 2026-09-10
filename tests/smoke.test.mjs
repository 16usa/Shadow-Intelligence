import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';

async function withServer(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'si-test-'));
  const dbPath=path.join(dir,'test.db');
  const server=createServer({dbPath});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{await fn(base)}finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true})}
}

test('health and overview work',async()=>withServer(async base=>{
  const h=await fetch(base+'/api/health').then(r=>r.json());
  assert.equal(h.ok,true);
  const o=await fetch(base+'/api/overview').then(r=>r.json());
  assert.ok(o.stats.trackedEntities>=5);
  assert.ok(Array.isArray(o.feed));
}));

test('first registered user becomes owner when no seeded owner exists',async()=>withServer(async base=>{
  const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:'Owner Test',email:'owner@test.local',password:'password123'})});
  assert.equal(r.status,201);
  const d=await r.json();
  assert.equal(d.user.role,'owner');
  assert.match(r.headers.get('set-cookie')||'',/si_session=/);
}));
