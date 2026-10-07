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

function normalizedImageIdentity(value) {
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const url=new URL(raw);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname}`;
  }catch{
    return raw.split(/[?#]/,1)[0];
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

/* SHADOW_FOMO_CLEAN_AVATAR_V17 */
function htmlAttribute(tag, name) {
  const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(tag || '').match(re);
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function isFomoProfilePage(baseUrl) {
  try {
    const url = new URL(String(baseUrl || ''));
    const host = url.hostname.toLowerCase();
    return host === 'fomo.family' || host.endsWith('.fomo.family');
  } catch {
    return false;
  }
}

function fomoHandleFromUrl(baseUrl) {
  try {
    const url = new URL(String(baseUrl || ''));
    const match = url.pathname.match(/\/profile\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]).replace(/^@+/, '').toLowerCase() : '';
  } catch {
    return '';
  }
}

function looksLikeFomoPreviewImage(value) {
  const raw = String(value || '').toLowerCase();
  if (!raw) return true;
  return /(?:^|[\/_-])(og|opengraph|open-graph|social-card|share-card|profile-card|preview|banner|cover)(?:[\/_\-.]|$)/i.test(raw) ||
    /\/api\/(?:og|social|preview)(?:[/?#]|$)/i.test(raw);
}

function extractFomoStructuredAvatar(source, baseUrl) {
  const patterns = [
    /"(?:profile_image|profileImage|profile_image_url|profileImageUrl|avatar_url|avatarUrl|avatar|profilePhoto|profile_photo|profilePicture|profile_picture|pfp|photoURL|photo_url)"\s*:\s*"((?:\\.|[^"\\])+)"/gi,
    /\\"(?:profile_image|profileImage|profile_image_url|profileImageUrl|avatar_url|avatarUrl|avatar|profilePhoto|profile_photo|profilePicture|profile_picture|pfp|photoURL|photo_url)\\"\s*:\s*\\"((?:\\\\.|[^"\\])+)\\"/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const image = absoluteUrl(match[1], baseUrl);
      if (image && !looksLikeFomoPreviewImage(image)) return image;
    }
  }
  return '';
}

function extractFomoImgAvatar(source, baseUrl) {
  const handle = fomoHandleFromUrl(baseUrl);
  const tags = String(source || '').match(/<img\b[^>]*>/gi) || [];
  let best = { score: 0, image: '' };

  for (const tag of tags) {
    const rawSrc = htmlAttribute(tag, 'src') || htmlAttribute(tag, 'data-src') || htmlAttribute(tag, 'data-lazy-src');
    let candidate = rawSrc;
    if (!candidate) {
      const srcset = htmlAttribute(tag, 'srcset') || htmlAttribute(tag, 'data-srcset');
      candidate = String(srcset || '').split(',')[0]?.trim().split(/\s+/)[0] || '';
    }

    const image = absoluteUrl(candidate, baseUrl);
    if (!image || looksLikeFomoPreviewImage(image)) continue;

    const tagLower = tag.toLowerCase();
    const imageLower = image.toLowerCase();
    const alt = htmlAttribute(tag, 'alt').toLowerCase();
    let score = 0;

    if (/avatar|user[-_ ]?avatar|profile[-_ ]?(?:image|photo|picture)|\bpfp\b/i.test(tagLower)) score += 80;
    if (/avatar|profile[-_ ]?(?:image|photo|picture)|\bpfp\b/i.test(imageLower)) score += 35;
    if (handle && (alt.includes(handle) || tagLower.includes(handle))) score += 35;
    if (handle && imageLower.includes(handle)) score += 15;
    if (/logo|site[-_ ]?icon|favicon|emoji|banner|cover/i.test(tagLower)) score -= 80;
    if (/logo|favicon|banner|cover/i.test(imageLower)) score -= 50;

    const width = Number(htmlAttribute(tag, 'width') || 0);
    const height = Number(htmlAttribute(tag, 'height') || 0);
    if (width > 0 && height > 0) {
      const ratio = width / height;
      if (ratio >= 0.8 && ratio <= 1.25) score += 8;
      if (width < 32 || height < 32) score -= 25;
    }

    if (score > best.score) best = { score, image };
  }

  return best.score > 0 ? best.image : '';
}

function extractFomoProfileImage(html, baseUrl) {
  const source = String(html || '');

  // Fomo's og:image is a social/profile preview card (avatar + handle + stats),
  // not the raw avatar. Never use it as an Entity avatar.
  const structured = extractFomoStructuredAvatar(source, baseUrl);
  if (structured) return structured;

  return extractFomoImgAvatar(source, baseUrl);
}
/* SHADOW_FOMO_CLEAN_AVATAR_V17_END */

function extractProfileImage(html, baseUrl) {
  const source = String(html || '');

  // Fomo profile pages expose an OG social card that contains text/stats.
  // Only accept the underlying avatar from structured/profile image data.
  if (isFomoProfilePage(baseUrl)) return extractFomoProfileImage(source, baseUrl);

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
      if(
        fomoHomeImage &&
        normalizedImageIdentity(result.avatar)===normalizedImageIdentity(fomoHomeImage)
      )continue;
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
