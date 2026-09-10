import { isSafeHttpUrl } from '../utils.mjs';

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
