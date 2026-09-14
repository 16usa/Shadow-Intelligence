import crypto from 'node:crypto';
import { isSafeHttpUrl } from '../utils.mjs';

const PUMP_USER_API = 'https://frontend-api-v3.pump.fun/users';

function generatedAvatar(wallet) {
  const digest = crypto.createHash('sha256').update(String(wallet)).digest('hex');
  const hue = parseInt(digest.slice(0, 4), 16) % 360;
  const hue2 = (hue + 46) % 360;
  const initials = String(wallet || '??').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="hsl(${hue} 72% 54%)"/><stop offset="1" stop-color="hsl(${hue2} 72% 38%)"/></linearGradient></defs><rect width="256" height="256" rx="128" fill="url(#g)"/><circle cx="128" cy="106" r="44" fill="rgba(255,255,255,.22)"/><path d="M53 222c14-45 42-69 75-69s61 24 75 69" fill="rgba(255,255,255,.22)"/><text x="128" y="239" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="white" opacity=".9">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function extractAvatar(data) {
  const candidates = [
    data?.profile_image,
    data?.profileImage,
    data?.profile_image_url,
    data?.profileImageUrl,
    data?.avatar_url,
    data?.avatarUrl,
    data?.avatar,
    data?.image,
    data?.image_url,
    data?.user?.profile_image,
    data?.user?.profileImage,
    data?.user?.avatar_url,
    data?.user?.avatarUrl,
    data?.data?.profile_image,
    data?.data?.profileImage,
    data?.data?.avatar_url,
    data?.data?.avatarUrl,
  ];

  for (const value of candidates) {
    const avatar = String(value || '').trim();
    if (avatar && isSafeHttpUrl(avatar)) return avatar;
  }
  return '';
}

async function requestJson(url, token = '') {
  const headers = {
    accept: 'application/json',
    origin: 'https://pump.fun',
    referer: 'https://pump.fun/',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function resolveDirectPumpProfile(wallet) {
  try {
    const data = await requestJson(
      `${PUMP_USER_API}/${encodeURIComponent(wallet)}`,
      process.env.PUMP_PROFILE_TOKEN || '',
    );
    const avatar = extractAvatar(data);
    return avatar ? { avatar, source: 'pump.fun' } : null;
  } catch {
    return null;
  }
}

async function resolveConfiguredProfile(wallet) {
  const endpoint = process.env.PUMP_PROFILE_LOOKUP_URL;
  if (!endpoint || !isSafeHttpUrl(endpoint)) return null;

  try {
    const url = new URL(endpoint);
    url.searchParams.set('wallet', wallet);
    const data = await requestJson(url, process.env.PUMP_PROFILE_TOKEN || '');
    const avatar = extractAvatar(data);
    return avatar ? { avatar, source: 'pump-profile' } : null;
  } catch {
    return null;
  }
}

export async function resolveWalletAvatar(wallet) {
  const direct = await resolveDirectPumpProfile(wallet);
  if (direct) return direct;

  const configured = await resolveConfiguredProfile(wallet);
  if (configured) return configured;

  return { avatar: generatedAvatar(wallet), source: 'generated' };
}
