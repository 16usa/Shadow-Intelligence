import { isSafeHttpUrl } from '../utils.mjs';

const PROFILE_PLATFORMS = new Set(['auto','fomo','pump.fun','x','other']);

export function normalizeProfilePlatform(value) {
  const raw = String(value || 'auto').trim().toLowerCase();
  if (raw === 'pump' || raw === 'pumpfun' || raw === 'pump_fun') return 'pump.fun';
  if (raw === 'twitter') return 'x';
  return PROFILE_PLATFORMS.has(raw) ? raw : 'other';
}

export function normalizeProfileHandle(value) {
  return String(value || '').trim().replace(/^@+/, '').slice(0, 100);
}

function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  return !!(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

export function isPublicProfileUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && !isBlockedHost(url.hostname);
  } catch {
    return false;
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function decodeJsonEscapes(value) {
  const raw = String(value || '');
  try {
    return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`);
  } catch {
    return raw.replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
  }
}

function absoluteUrl(value, baseUrl) {
  const raw = decodeHtml(decodeJsonEscapes(value)).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, baseUrl);
    return isSafeHttpUrl(url.toString()) ? url.toString() : '';
  } catch {
    return '';
  }
}

function metaContent(tag) {
  const match = String(tag).match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function metaName(tag) {
  const match = String(tag).match(/\b(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return String(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim().toLowerCase();
}

function extractProfileImage(html, baseUrl) {
  const source = String(html || '');

  const metaTags = source.match(/<meta\b[^>]*>/gi) || [];
  const preferred = ['og:image','og:image:secure_url','twitter:image','twitter:image:src'];

  for (const key of preferred) {
    for (const tag of metaTags) {
      if (metaName(tag) !== key) continue;
      const image = absoluteUrl(metaContent(tag), baseUrl);
      if (image) return image;
    }
  }

  const jsonPatterns = [
    /"(?:profile_image|profileImage|profile_image_url|profileImageUrl|avatar_url|avatarUrl|avatar)"\s*:\s*"((?:\\.|[^"\\])+)"/gi,
    /"(?:image_url|imageUrl)"\s*:\s*"((?:\\.|[^"\\])+)"/gi,
  ];

  for (const pattern of jsonPatterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const image = absoluteUrl(match[1], baseUrl);
      if (image) return image;
    }
  }

  return '';
}

async function fetchProfilePage(url) {
  if (!isPublicProfileUrl(url)) return null;

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; ShadowIntelligence/1.0)',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) return null;

    const finalUrl = response.url || url;
    if (!isPublicProfileUrl(finalUrl)) return null;

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return null;

    const html = (await response.text()).slice(0, 900_000);
    const avatar = extractProfileImage(html, finalUrl);
    return { avatar, profileUrl: finalUrl };
  } catch {
    return null;
  }
}

function profileCandidates({ platform, handle, profileUrl }) {
  const candidates = [];
  const push = value => {
    const url = String(value || '').trim();
    if (url && !candidates.includes(url)) candidates.push(url);
  };

  if (profileUrl) push(profileUrl);

  if (handle && (platform === 'fomo' || platform === 'auto')) {
    push(`https://fomo.family/profile/${encodeURIComponent(handle)}`);
  }

  if (handle && (platform === 'x' || platform === 'auto')) {
    push(`https://x.com/${encodeURIComponent(handle)}`);
  }

  return candidates;
}

export async function resolveProfileAvatar(input = {}) {
  const platform = normalizeProfilePlatform(input.platform);
  const handle = normalizeProfileHandle(input.handle);
  const profileUrl = String(input.profileUrl || '').trim();
  const candidates = profileCandidates({ platform, handle, profileUrl });

  for (const url of candidates) {
    const result = await fetchProfilePage(url);
    if (result?.avatar) {
      return {
        avatar: result.avatar,
        source: platform === 'auto' ? 'profile' : platform,
        profileUrl: result.profileUrl || url,
      };
    }
  }

  return {
    avatar: '',
    source: 'pending',
    profileUrl: candidates.find(isPublicProfileUrl) || '',
  };
}
