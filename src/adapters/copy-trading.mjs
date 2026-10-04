/* SHADOW_INTERNAL_COPY_ENGINE_V330 */
import { isSafeHttpUrl } from '../utils.mjs';

function normalizeCopySubscription(subscription={}) {
  const min=Math.max(0,Number(
    subscription.minMarketCapUsd ?? subscription.min_market_cap_usd ?? 0
  )||0);
  const rawMax=Number(
    subscription.maxMarketCapUsd ?? subscription.max_market_cap_usd ?? 0
  );
  const max=Number.isFinite(rawMax)&&rawMax>0?rawMax:0;
  const enabled=min>0||max>0;

  return {
    ...subscription,
    minMarketCapUsd:min,
    maxMarketCapUsd:max,
    buyFilters:{
      ...(subscription.buyFilters||{}),
      marketCapUsd:{
        enabled,
        min,
        max,
        appliesTo:'buy',
        marketCapSource:'current_at_execution',
        unknownMarketCap:'skip'
      }
    }
  };
}


export async function syncCopyGroup(group, wallets) {
  const endpoint = process.env.COPY_ENGINE_URL;
  if (!endpoint || !isSafeHttpUrl(endpoint)) {
    return { mode: 'simulation', ok: true, message: 'No external copy engine configured; group state stored locally.' };
  }
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (process.env.COPY_ENGINE_TOKEN) headers.authorization = `Bearer ${process.env.COPY_ENGINE_TOKEN}`;
  const response = await fetch(new URL('/groups/sync', endpoint), {
    method: 'POST', headers, body: JSON.stringify({ group, wallets }), signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Copy engine HTTP ${response.status}`);
  return { mode: 'external', ok: true, data: await response.json() };
}

/* SHADOW_USER_COPY_TRADING_V230_ADAPTER */
export async function syncCopySubscription(subscription, entityWallets, action='upsert') {
  const normalizedSubscription=normalizeCopySubscription(subscription);
  const endpoint=process.env.COPY_ENGINE_URL;
  const internal=globalThis.__SHADOW_INTERNAL_COPY_ENGINE_SYNC;
  if((!endpoint || !isSafeHttpUrl(endpoint)) && typeof internal==='function'){
    const data=await internal({action,subscription:normalizedSubscription,entityWallets});
    return {
      mode:'internal',configured:true,ok:true,
      active:data?.active===true,
      authorizationUrl:String(data?.authorizationUrl||''),
      data
    };
  }
  if(!endpoint || !isSafeHttpUrl(endpoint)){
    return {mode:'unconfigured',configured:false,ok:false,active:false,message:'Copy execution engine is not configured'};
  }

  const headers={'content-type':'application/json',accept:'application/json'};
  if(process.env.COPY_ENGINE_TOKEN)headers.authorization=`Bearer ${process.env.COPY_ENGINE_TOKEN}`;

  const response=await fetch(new URL('/subscriptions/sync',endpoint),{
    method:'POST',
    headers,
    body:JSON.stringify({
      action,
      subscription:normalizedSubscription,
      marketCapPolicy:normalizedSubscription.buyFilters.marketCapUsd,
      entityWallets:entityWallets.map(w=>({
        id:w.id,
        address:w.address,
        label:w.label||'',
        chain:w.chain||'solana'
      }))
    }),
    signal:AbortSignal.timeout(12000)
  });

  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    throw new Error(data?.error||`Copy engine HTTP ${response.status}`);
  }

  return {
    mode:'external',
    configured:true,
    ok:true,
    active:data?.active===true,
    authorizationUrl:String(data?.authorizationUrl||''),
    data
  };
}
/* SHADOW_USER_COPY_TRADING_V230_ADAPTER_END */

