function handleName(value) { return String(value || '').trim().replace(/^@/, ''); }
export function xConfigured() { return !!process.env.X_BEARER_TOKEN; }

async function xGet(path, params = {}, { fetchImpl = fetch } = {}) {
  if (!process.env.X_BEARER_TOKEN) throw new Error('X API is not configured');
  const url = new URL(`https://api.x.com${path}`);
  for (const [k,v] of Object.entries(params)) if (v !== '' && v != null) url.searchParams.set(k,String(v));
  const response = await fetchImpl(url,{headers:{accept:'application/json',authorization:`Bearer ${process.env.X_BEARER_TOKEN}`},signal:AbortSignal.timeout(10000)});
  if (!response.ok) {
    let detail=''; try{detail=(await response.json())?.detail||''}catch{}
    throw new Error(`X API HTTP ${response.status}${detail?`: ${detail}`:''}`);
  }
  return response.json();
}

export async function getXProfile(xHandle, options={}) {
  const username = handleName(xHandle);
  if (!username) return null;
  const body = await xGet(`/2/users/by/username/${encodeURIComponent(username)}`,{
    'user.fields':'created_at,description,profile_image_url,public_metrics,url,verified'
  },options);
  return body?.data || null;
}

export async function getXPosts(userId, { sinceId='', limit=10, fetchImpl=fetch }={}) {
  if (!userId) return [];
  const body = await xGet(`/2/users/${encodeURIComponent(userId)}/tweets`,{
    max_results:String(Math.max(5,Math.min(limit,100))),
    'tweet.fields':'created_at,entities,public_metrics',
    exclude:'retweets,replies',
    since_id:sinceId || ''
  },{fetchImpl});
  return Array.isArray(body?.data) ? body.data : [];
}
