import { isSafeHttpUrl } from '../utils.mjs';

export async function providerHealth() {
  const endpoint = process.env.INTELLIGENCE_PROVIDER_URL;
  if (!endpoint || !isSafeHttpUrl(endpoint)) return { configured: false, status: 'local-demo' };
  try {
    const headers = { accept: 'application/json' };
    if (process.env.INTELLIGENCE_PROVIDER_TOKEN) headers.authorization = `Bearer ${process.env.INTELLIGENCE_PROVIDER_TOKEN}`;
    const r = await fetch(new URL('/health', endpoint), { headers, signal: AbortSignal.timeout(5000) });
    return { configured: true, status: r.ok ? 'online' : `http-${r.status}` };
  } catch { return { configured: true, status: 'offline' }; }
}
