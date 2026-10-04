import { isSafeHttpUrl } from '../utils.mjs';
import { resolvePumpUserProfile } from './pump-profile.mjs';

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
    return { avatar, profileUrl: finalUrl, html };
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

  /*
   * Auto is detection, not a platform preference.
   * Pump.fun has an identity API that accepts username or wallet, so it is the
   * first strict check. It must return a real user object; no generated image
   * is accepted as a successful match.
   */
  if(handle && (platform==='pump.fun' || platform==='auto')){
    const pump=await resolvePumpUserProfile(handle);
    if(pump){
      return {
        avatar:pump.avatar||'',
        source:pump.avatar?'pump.fun':'pending',
        platform:'pump.fun',
        profileUrl:pump.profileUrl||'',
        handle:pump.username||handle
      };
    }

    // If Pump.fun was explicitly selected, do not silently relabel it Fomo/X.
    if(platform==='pump.fun'){
      return {
        avatar:'',
        source:'pending',
        platform:'pump.fun',
        profileUrl:'',
        handle
      };
    }
  }

  const candidates = profileCandidates({ platform, handle, profileUrl });

  // Cache the Fomo homepage image for this resolution. If a /profile/<handle>
  // page returns the exact same OG image, it is a generic site preview, not the
  // user's avatar, and must not be stored on the Entity.
  let fomoHomeImage;

  for (const url of candidates) {
    const result = await fetchProfilePage(url);
    if(!result?.avatar)continue;

    let detectedPlatform=platform;
    try{
      const host=new URL(result.profileUrl||url).hostname.toLowerCase();
      if(host==='fomo.family'||host.endsWith('.fomo.family'))detectedPlatform='fomo';
      else if(host==='x.com'||host.endsWith('.x.com')||host==='twitter.com'||host.endsWith('.twitter.com'))detectedPlatform='x';
      else if(platform==='auto')detectedPlatform='other';
    }catch{
      if(platform==='auto')detectedPlatform='other';
    }

    if(detectedPlatform==='fomo'){
      if(fomoHomeImage===undefined){
        const home=await fetchProfilePage('https://fomo.family/');
        fomoHomeImage=home?.avatar||'';
      }

      // This is the exact failure that made unrelated Pump.fun handles all
      // receive the same Fomo image.
      if(fomoHomeImage && result.avatar===fomoHomeImage)continue;
    }

    return {
      avatar:result.avatar,
      source:detectedPlatform==='auto'?'profile':detectedPlatform,
      platform:detectedPlatform,
      profileUrl:result.profileUrl||url,
      handle
    };
  }

  return {
    avatar:'',
    source:'pending',
    platform,
    profileUrl:candidates.find(isPublicProfileUrl) || '',
    handle
  };
}
