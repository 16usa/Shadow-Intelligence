import { isSafeHttpUrl } from '../utils.mjs';
import { resolvePumpUserProfile } from './pump-profile.mjs';

const PROFILE_PLATFORMS = new Set(['auto','fomo','pump.fun','x','other']);
const FOMO_LOOKUP_CACHE = new Map();
const FOMO_LOOKUP_TTL_MS = 30 * 60 * 1000;

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

// Fomo social/share cards are NOT avatars. They contain the username,
// followers/trades text and coloured strips. Only accept explicit profile-picture
// fields from embedded JSON when reading fomo.family HTML.
function extractFomoEmbeddedAvatar(html, baseUrl) {
  const source = String(html || '');
  const patterns = [
    /"profilePictureLink"\s*:\s*"((?:\\.|[^"\\])+)"/gi,
    /"profile_picture_link"\s*:\s*"((?:\\.|[^"\\])+)"/gi,
    /"profilePicture"\s*:\s*"((?:\\.|[^"\\])+)"/gi,
    /"profileImageUrl"\s*:\s*"((?:\\.|[^"\\])+)"/gi,
    /"avatarUrl"\s*:\s*"((?:\\.|[^"\\])+)"/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const image = absoluteUrl(match[1], baseUrl);
      if (!image) continue;
      const low = image.toLowerCase();
      if (/\b(?:share|social|preview|card|og-image|opengraph)\b/.test(low)) continue;
      return image;
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
        'user-agent': 'Mozilla/5.0 (compatible; SYNC/1.0)',
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

function cleanExactHandle(value) {
  return normalizeProfileHandle(value).toLowerCase();
}

async function fetchFomoPublicAvatar(handle) {
  const normalized = normalizeProfileHandle(handle);
  if (!normalized) return { found:false, avatar:'' };
  const key = normalized.toLowerCase();
  const cached = FOMO_LOOKUP_CACHE.get(key);
  if (cached && Date.now() - cached.at < FOMO_LOOKUP_TTL_MS) return cached.value;

  let value = { found:false, avatar:'' };
  try {
    // Free/no-key public search. We use it only to obtain Fomo's real
    // profilePictureLink. We never use a rendered/share card as an avatar.
    const url = `https://fomolens.app/api/public/search?q=${encodeURIComponent(normalized)}`;
    const response = await fetch(url, {
      redirect:'follow',
      headers:{
        accept:'application/json',
        'user-agent':'Mozilla/5.0 (compatible; SYNC/1.0)'
      },
      signal:AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const data = await response.json().catch(()=>null);
      const raw = Array.isArray(data?.results) ? data.results : (data?.results ? [data.results] : []);
      const row = raw.find(item =>
        String(item?.kind||'').toLowerCase()==='trader' &&
        cleanExactHandle(item?.userHandle)===key
      );
      if (row) {
        const avatar = absoluteUrl(row.profilePictureLink || '', 'https://fomolens.app/');
        value = { found:true, avatar };
      }
    }
  } catch {}

  FOMO_LOOKUP_CACHE.set(key,{at:Date.now(),value});
  return value;
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
  const wallet = String(input.wallet || '').trim();

  /*
   * Auto is detection, not a platform preference.
   * Pump.fun is checked through its user API. When the Entity already has a
   * wallet, Auto only accepts the Pump.fun username when the returned Pump.fun
   * address matches that wallet.
   */
  if(handle && (platform==='pump.fun' || platform==='auto')){
    const pump=await resolvePumpUserProfile(handle);
    const pumpAddress=String(pump?.address||'').trim();
    const walletMatches=!wallet || !pumpAddress || pumpAddress===wallet;
    const pumpAccepted=!!pump && (platform==='pump.fun' || walletMatches);

    if(pumpAccepted){
      return {
        avatar:pump.avatar||'',
        source:pump.avatar?'pump.fun':'pending',
        platform:'pump.fun',
        profileUrl:pump.profileUrl||'',
        handle:pump.username||handle,
        address:pumpAddress
      };
    }

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

  // Fomo must resolve to a REAL profilePictureLink. Do this before scraping
  // profile HTML so og:image/share-card assets can never leak into avatar UI.
  if(handle && (platform==='fomo' || platform==='auto')){
    const fomo=await fetchFomoPublicAvatar(handle);
    if(fomo.found){
      return {
        avatar:fomo.avatar||'',
        source:fomo.avatar?'fomo-profile':'pending',
        platform:'fomo',
        profileUrl:`https://fomo.family/profile/${encodeURIComponent(handle)}`,
        handle
      };
    }
  }

  const candidates = profileCandidates({ platform, handle, profileUrl });

  for (const url of candidates) {
    const result = await fetchProfilePage(url);
    if(!result)continue;

    let detectedPlatform=platform;
    let host='';
    try{
      host=new URL(result.profileUrl||url).hostname.toLowerCase();
      if(host==='fomo.family'||host.endsWith('.fomo.family'))detectedPlatform='fomo';
      else if(host==='x.com'||host.endsWith('.x.com')||host==='twitter.com'||host.endsWith('.twitter.com'))detectedPlatform='x';
      else if(platform==='auto')detectedPlatform='other';
    }catch{
      if(platform==='auto')detectedPlatform='other';
    }

    if(detectedPlatform==='fomo'){
      const cleanAvatar=extractFomoEmbeddedAvatar(result.html,result.profileUrl||url);
      if(cleanAvatar){
        return {
          avatar:cleanAvatar,
          source:'fomo-profile',
          platform:'fomo',
          profileUrl:result.profileUrl||url,
          handle
        };
      }
      // IMPORTANT: never use result.avatar here. On Fomo that is commonly the
      // social preview card which contains text/strips and caused the broken crop.
      continue;
    }

    if(!result.avatar)continue;
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
