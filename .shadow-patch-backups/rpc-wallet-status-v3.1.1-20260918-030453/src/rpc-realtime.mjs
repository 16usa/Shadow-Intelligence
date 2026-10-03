import { isSolanaAddress } from './utils.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function cleanWsUrl(value){
  const text=String(value||'').trim();
  return /^wss?:\/\//i.test(text)?text:'';
}

function wsFromHttp(value){
  const text=String(value||'').trim();
  if(!/^https?:\/\//i.test(text))return '';
  try{
    const url=new URL(text);
    url.protocol=url.protocol==='https:'?'wss:':'ws:';
    return url.toString();
  }catch{
    return '';
  }
}

function websocketEndpoints(){
  const out=[];
  const add=value=>{const v=String(value||'').trim();if(v&&!out.includes(v))out.push(v)};

  add(cleanWsUrl(process.env.SOLANA_WS_URL));
  add(wsFromHttp(process.env.SOLANA_RPC_URL));
  add(cleanWsUrl(process.env.SOLANA_BACKUP_WS_URL));
  add(wsFromHttp(process.env.SOLANA_BACKUP_RPC_URL));

  if(!out.length)add('wss://api.mainnet-beta.solana.com');
  return out;
}

function endpointLabel(value){
  const text=String(value||'');
  if(/mainnet-beta\.solana\.com/i.test(text))return 'public-rpc';
  return 'custom-rpc';
}

async function websocketMessageText(data){
  if(typeof data==='string')return data;
  if(data instanceof ArrayBuffer)return Buffer.from(data).toString('utf8');
  if(ArrayBuffer.isView(data))return Buffer.from(data.buffer,data.byteOffset,data.byteLength).toString('utf8');
  if(data?.text)return await data.text();
  return String(data||'');
}

export function createRpcRealtimeMonitor({db,getSetting,onSignature}={}){
  if(!db)throw new Error('RPC realtime monitor requires db');
  if(typeof getSetting!=='function')throw new Error('RPC realtime monitor requires getSetting');
  if(typeof onSignature!=='function')throw new Error('RPC realtime monitor requires onSignature');

  let started=false;
  let ws=null;
  let connected=false;
  let connecting=false;
  let endpointIndex=0;
  let reconnectAttempt=0;
  let reconnectTimer=null;
  let controlTimer=null;
  let reconcileTimer=null;
  let heartbeatTimer=null;
  let reconciling=false;
  let requestId=1000;
  let lastConnectedAt='';
  let lastDisconnectedAt='';
  let lastEventAt='';
  let lastProcessedAt='';
  let lastError='';
  let desiredWalletCount=0;

  const pending=new Map();
  const subscriptionByWallet=new Map();
  const walletBySubscription=new Map();
  const eventQueue=[];
  const queuedKeys=new Set();
  let eventWorkers=0;
  const MAX_EVENT_WORKERS=3;

  const mode=()=>String(getSetting(db,'wallet_monitor_mode','current')||'current')==='solana_rpc'?'solana_rpc':'current';
  const enabled=()=>getSetting(db,'live_monitor_enabled','true')==='true';
  const shouldRun=()=>started&&enabled()&&mode()==='solana_rpc';

  function currentEndpoint(){
    const endpoints=websocketEndpoints();
    if(endpointIndex>=endpoints.length)endpointIndex=0;
    return endpoints[endpointIndex]||'wss://api.mainnet-beta.solana.com';
  }

  function rejectPending(reason='WebSocket disconnected'){
    for(const item of pending.values()){
      clearTimeout(item.timer);
      item.reject(new Error(reason));
    }
    pending.clear();
  }

  function clearConnectionTimers(){
    if(heartbeatTimer)clearInterval(heartbeatTimer);
    heartbeatTimer=null;
  }

  function clearSubscriptions(){
    subscriptionByWallet.clear();
    walletBySubscription.clear();
  }

  function scheduleReconnect(){
    if(!shouldRun()||reconnectTimer)return;
    const delay=Math.min(30000,1000*(2**Math.min(reconnectAttempt,5)));
    reconnectAttempt++;
    reconnectTimer=setTimeout(()=>{
      reconnectTimer=null;
      connect();
    },delay);
    reconnectTimer.unref?.();
  }

  function disconnect(reason='inactive'){
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
    clearConnectionTimers();
    rejectPending(reason);
    clearSubscriptions();
    connected=false;
    connecting=false;
    const socket=ws;
    ws=null;
    if(socket){
      try{socket.close(1000,reason)}catch{}
    }
  }

  function sendRpc(method,params,timeoutMs=8000){
    if(!ws||!connected||ws.readyState!==1)return Promise.reject(new Error('Solana WebSocket is not connected'));
    const id=++requestId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      },timeoutMs);
      timer.unref?.();
      pending.set(id,{resolve,reject,timer,method});
      try{
        ws.send(JSON.stringify({jsonrpc:'2.0',id,method,params}));
      }catch(error){
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  async function subscribeWallet(wallet){
    if(!connected||!wallet?.id||!isSolanaAddress(wallet.address))return;
    if(subscriptionByWallet.has(wallet.id))return;
    const subscriptionId=await sendRpc('logsSubscribe',[
      {mentions:[wallet.address]},
      {commitment:'confirmed'}
    ]);
    subscriptionByWallet.set(wallet.id,{subscriptionId,address:wallet.address});
    walletBySubscription.set(String(subscriptionId),{walletId:wallet.id,address:wallet.address});
  }

  async function unsubscribeWallet(walletId){
    const current=subscriptionByWallet.get(walletId);
    if(!current)return;
    subscriptionByWallet.delete(walletId);
    walletBySubscription.delete(String(current.subscriptionId));
    if(connected){
      try{await sendRpc('logsUnsubscribe',[current.subscriptionId],5000)}catch{}
    }
  }

  async function reconcileSubscriptions(){
    if(reconciling||!connected||!shouldRun())return;
    reconciling=true;
    try{
      const rows=db.prepare(`
        SELECT id,address
        FROM wallets
        WHERE monitoring_enabled=1
        ORDER BY created_at
      `).all().filter(row=>isSolanaAddress(row.address));
      desiredWalletCount=rows.length;
      const desired=new Map(rows.map(row=>[row.id,row]));

      for(const [walletId,current] of [...subscriptionByWallet]){
        const row=desired.get(walletId);
        if(!row||row.address!==current.address)await unsubscribeWallet(walletId);
      }

      for(const row of rows){
        if(!connected||!shouldRun())break;
        if(subscriptionByWallet.has(row.id))continue;
        try{
          await subscribeWallet(row);
          await sleep(30);
        }catch(error){
          lastError=String(error?.message||error);
          if(/429|rate|limit|too many/i.test(lastError))await sleep(1000);
          if(!connected)break;
        }
      }
    }finally{
      reconciling=false;
    }
  }

  function queueSignature(item){
    const key=`${item.walletId}:${item.signature}`;
    if(!item.signature||queuedKeys.has(key))return;
    queuedKeys.add(key);
    eventQueue.push({...item,key});
    if(eventQueue.length>5000){
      const removed=eventQueue.splice(0,eventQueue.length-5000);
      for(const x of removed)queuedKeys.delete(x.key);
    }
    drainEventQueue();
  }

  function drainEventQueue(){
    while(eventWorkers<MAX_EVENT_WORKERS&&eventQueue.length){
      const item=eventQueue.shift();
      eventWorkers++;
      Promise.resolve(onSignature(item))
        .then(()=>{lastProcessedAt=new Date().toISOString();lastError='';})
        .catch(error=>{lastError=String(error?.message||error);})
        .finally(()=>{
          queuedKeys.delete(item.key);
          eventWorkers--;
          drainEventQueue();
        });
    }
  }

  async function handleMessage(event){
    let message;
    try{message=JSON.parse(await websocketMessageText(event.data));}
    catch{return;}

    if(Object.hasOwn(message,'id')){
      const item=pending.get(message.id);
      if(!item)return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      if(message.error)item.reject(new Error(message.error.message||`${item.method} failed`));
      else item.resolve(message.result);
      return;
    }

    if(message.method!=='logsNotification')return;
    const sub=String(message.params?.subscription??'');
    const wallet=walletBySubscription.get(sub);
    const value=message.params?.result?.value;
    const signature=String(value?.signature||'');
    if(!wallet||!signature||value?.err)return;
    lastEventAt=new Date().toISOString();
    queueSignature({
      ...wallet,
      signature,
      slot:Number(message.params?.result?.context?.slot||0)
    });
  }

  function connect(){
    if(!shouldRun()||connected||connecting)return;
    if(typeof WebSocket!=='function'){
      lastError='WebSocket is unavailable in this Node runtime';
      return;
    }

    connecting=true;
    const endpoint=currentEndpoint();
    let socket;
    try{socket=new WebSocket(endpoint)}
    catch(error){
      connecting=false;
      lastError=String(error?.message||error);
      endpointIndex=(endpointIndex+1)%websocketEndpoints().length;
      scheduleReconnect();
      return;
    }
    ws=socket;

    socket.onopen=()=>{
      if(ws!==socket)return;
      connected=true;
      connecting=false;
      reconnectAttempt=0;
      lastConnectedAt=new Date().toISOString();
      lastError='';
      reconcileSubscriptions();
      clearConnectionTimers();
      heartbeatTimer=setInterval(()=>{
        if(!connected)return;
        sendRpc('getSlot',[],6000).catch(error=>{
          lastError=String(error?.message||error);
          try{socket.close()}catch{}
        });
      },25000);
      heartbeatTimer.unref?.();
    };

    socket.onmessage=event=>{handleMessage(event).catch(error=>{lastError=String(error?.message||error)})};
    socket.onerror=()=>{lastError='Solana WebSocket connection error'};
    socket.onclose=()=>{
      if(ws===socket)ws=null;
      connected=false;
      connecting=false;
      lastDisconnectedAt=new Date().toISOString();
      clearConnectionTimers();
      rejectPending('Solana WebSocket disconnected');
      clearSubscriptions();
      endpointIndex=(endpointIndex+1)%websocketEndpoints().length;
      scheduleReconnect();
    };
  }

  function refresh(){
    if(!started)return status();
    if(!enabled()||mode()!=='solana_rpc'){
      disconnect('monitor mode changed');
      return status();
    }
    if(!connected&&!connecting)connect();
    else if(connected)reconcileSubscriptions();
    return status();
  }

  function start(){
    if(started)return status();
    started=true;
    refresh();
    controlTimer=setInterval(refresh,3000);
    reconcileTimer=setInterval(()=>{if(connected)reconcileSubscriptions()},10000);
    controlTimer.unref?.();
    reconcileTimer.unref?.();
    return status();
  }

  function stop(){
    started=false;
    if(controlTimer)clearInterval(controlTimer);
    if(reconcileTimer)clearInterval(reconcileTimer);
    controlTimer=null;
    reconcileTimer=null;
    disconnect('monitor stopped');
  }

  function status(){
    return {
      enabled:enabled(),
      selected:mode()==='solana_rpc',
      connected,
      connecting,
      provider:endpointLabel(currentEndpoint()),
      subscriptions:subscriptionByWallet.size,
      wallets:desiredWalletCount,
      queueDepth:eventQueue.length+eventWorkers,
      lastConnectedAt,
      lastDisconnectedAt,
      lastEventAt,
      lastProcessedAt,
      lastError
    };
  }

  return {start,stop,refresh,status,reconcileSubscriptions};
}
