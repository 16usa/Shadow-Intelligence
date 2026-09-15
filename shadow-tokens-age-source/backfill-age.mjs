
import { DatabaseSync } from 'node:sqlite';

const dbPath=process.env.DB_PATH||'./shadow-intelligence.db';
const db=new DatabaseSync(dbPath);

const columns=new Set(db.prepare(`PRAGMA table_info(tokens)`).all().map(x=>x.name));
if(!columns.has('token_created_at')){
  db.exec(`ALTER TABLE tokens ADD COLUMN token_created_at TEXT DEFAULT ''`);
}
if(!columns.has('token_age_source')){
  db.exec(`ALTER TABLE tokens ADD COLUMN token_age_source TEXT DEFAULT ''`);
}

const rows=db.prepare(`
  SELECT id,mint,is_pump,token_created_at,token_age_source
  FROM tokens
  WHERE is_pump=1 OR LOWER(mint) LIKE '%pump'
`).all();

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

function normalize(value){
  if(value==null||value==='')return null;
  const n=Number(value);
  if(Number.isFinite(n)&&n>0){
    const ms=n<1e12?n*1000:n;
    if(ms>=1230768000000 && ms<=Date.now()+86400000)return ms;
  }
  const parsed=Date.parse(String(value));
  return Number.isFinite(parsed)?parsed:null;
}

async function fetchCreated(mint){
  const url=`https://frontend-api-v3.pump.fun/coins-v2/${encodeURIComponent(mint)}`;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetch(url,{
        headers:{accept:'application/json','user-agent':'ShadowIntelligence/0.6'},
        signal:AbortSignal.timeout(6500)
      });
      if(r.ok){
        const body=await r.json();
        const data=Array.isArray(body)?body[0]:(body?.data&&typeof body.data==='object'?body.data:body);
        const ms=normalize(data?.created_timestamp??data?.createdTimestamp??data?.created_at??data?.createdAt);
        if(ms)return ms;
      }
      if(r.status!==429 && r.status<500)return null;
    }catch{}
    if(attempt<2)await sleep(attempt===0?300:800);
  }
  return null;
}

const update=db.prepare(`
  UPDATE tokens SET token_created_at=?,token_age_source=? WHERE id=?
`);

let cursor=0,updated=0,failed=0;
const concurrency=4;

async function worker(){
  while(true){
    const index=cursor++;
    if(index>=rows.length)return;
    const row=rows[index];

    // Recheck every Pump token, because v2.6.4 may have cached migration/pair time.
    const ms=await fetchCreated(row.mint);
    if(ms){
      update.run(new Date(ms).toISOString(),'pump_created_timestamp',row.id);
      updated++;
    }else{
      // Better unknown than wrong.
      update.run('','pump_age_unavailable',row.id);
      failed++;
    }
  }
}

await Promise.all(Array.from({length:Math.min(concurrency,Math.max(1,rows.length))},worker));

console.log(`Pump age backfill: checked=${rows.length} updated=${updated} unavailable=${failed}`);
