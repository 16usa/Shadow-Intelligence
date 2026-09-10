import crypto from 'node:crypto';
import { isSafeHttpUrl } from '../utils.mjs';

function generatedAvatar(wallet) {
  const digest = crypto.createHash('sha256').update(String(wallet)).digest('hex');
  const hue = parseInt(digest.slice(0, 4), 16) % 360;
  const hue2 = (hue + 46) % 360;
  const initials = String(wallet || '??').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="hsl(${hue} 72% 54%)"/><stop offset="1" stop-color="hsl(${hue2} 72% 38%)"/></linearGradient></defs><rect width="256" height="256" rx="128" fill="url(#g)"/><circle cx="128" cy="106" r="44" fill="rgba(255,255,255,.22)"/><path d="M53 222c14-45 42-69 75-69s61 24 75 69" fill="rgba(255,255,255,.22)"/><text x="128" y="239" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="white" opacity=".9">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function resolveWalletAvatar(wallet) {
  const endpoint = process.env.PUMP_PROFILE_LOOKUP_URL;
  if (endpoint && isSafeHttpUrl(endpoint)) {
    const url = new URL(endpoint);
    url.searchParams.set('wallet', wallet);
    const headers = { accept: 'application/json' };
    if (process.env.PUMP_PROFILE_TOKEN) headers.authorization = `Bearer ${process.env.PUMP_PROFILE_TOKEN}`;
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
      if (response.ok) {
        const data = await response.json();
        const avatar = data.avatarUrl || data.avatar || data.image || data.profileImage;
        if (avatar && isSafeHttpUrl(avatar)) return { avatar, source: 'pump-profile' };
      }
    } catch {}
  }
  return { avatar: generatedAvatar(wallet), source: 'generated' };
}
