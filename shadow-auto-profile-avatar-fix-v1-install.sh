#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  echo "ERROR: run this patch from inside the Shadow-Intelligence git repository."
  exit 1
fi

cd "$ROOT"

ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
BRANCH="$(git branch --show-current 2>/dev/null || true)"

case "$ORIGIN" in
  *16usa/Shadow-Intelligence*) ;;
  *)
    echo "ERROR: this does not look like 16usa/Shadow-Intelligence."
    echo "origin: $ORIGIN"
    exit 1
    ;;
esac

if [ "$BRANCH" != "main" ]; then
  echo "ERROR: expected branch main, found: $BRANCH"
  exit 1
fi

for f in server.mjs src/adapters/pump-profile.mjs src/adapters/profile-avatar.mjs; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 - <<'PY'
from pathlib import Path

def require(text, needle, label):
    if needle not in text:
        raise SystemExit(f"ERROR: expected marker not found: {label}")

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------
# 1) Pump.fun: strict username/profile lookup (no generated fallback)
# ---------------------------------------------------------------------
p = Path("src/adapters/pump-profile.mjs")
s = p.read_text()

wallet_export = "export async function resolveWalletAvatar(wallet) {"
require(s, wallet_export, "resolveWalletAvatar")

if "resolvePumpUserProfile" not in s:
    strict = r'''
/* SHADOW_STRICT_PUMP_PROFILE_V351 */
export async function resolvePumpUserProfile(identifier) {
  const value=String(identifier||'').trim().replace(/^@+/,'');
  if(!value)return null;

  try{
    const data=await requestJson(
      `${PUMP_USER_API}/${encodeURIComponent(value)}`,
      process.env.PUMP_PROFILE_TOKEN || '',
    );
    if(!data || typeof data!=='object')return null;

    const address=String(
      data?.address ||
      data?.wallet ||
      data?.wallet_address ||
      data?.walletAddress ||
      ''
    ).trim();

    const username=String(
      data?.username ||
      data?.user_name ||
      data?.handle ||
      ''
    ).trim().replace(/^@+/,'');

    // A real Pump.fun user response carries an identity. Never treat a generic
    // HTTP page/image as a successful Pump.fun username match.
    if(!address && !username)return null;

    return {
      avatar:extractAvatar(data),
      source:'pump.fun',
      platform:'pump.fun',
      username:username||value,
      address,
      profileUrl:address
        ? `https://pump.fun/profile/${encodeURIComponent(address)}`
        : ''
    };
  }catch{
    return null;
  }
}
/* SHADOW_STRICT_PUMP_PROFILE_V351_END */

'''
    s = s.replace(wallet_export, strict + wallet_export, 1)

old_wallet = r'''export async function resolveWalletAvatar(wallet) {
  const direct = await resolveDirectPumpProfile(wallet);
  if (direct) return direct;

  const configured = await resolveConfiguredProfile(wallet);
  if (configured) return configured;

  return { avatar: generatedAvatar(wallet), source: 'generated' };
}
'''
new_wallet = r'''export async function resolveWalletAvatar(wallet) {
  const strict = await resolvePumpUserProfile(wallet);
  if (strict?.avatar) return { avatar:strict.avatar, source:'pump.fun' };

  const direct = await resolveDirectPumpProfile(wallet);
  if (direct) return direct;

  const configured = await resolveConfiguredProfile(wallet);
  if (configured) return configured;

  return { avatar: generatedAvatar(wallet), source: 'generated' };
}
'''
s = replace_once(s, old_wallet, new_wallet, "wallet avatar resolver")

p.write_text(s)

# ---------------------------------------------------------------------
# 2) Auto profile resolver:
#    Pump.fun strict lookup FIRST; reject generic Fomo OG image
# ---------------------------------------------------------------------
p = Path("src/adapters/profile-avatar.mjs")
s = p.read_text()

import_line = "import { isSafeHttpUrl } from '../utils.mjs';\n"
require(s, import_line, "profile-avatar import")
if "resolvePumpUserProfile" not in s:
    s = s.replace(
        import_line,
        import_line + "import { resolvePumpUserProfile } from './pump-profile.mjs';\n",
        1
    )

old_fetch_return = "    const avatar = extractProfileImage(html, finalUrl);\n    return { avatar, profileUrl: finalUrl };\n"
new_fetch_return = "    const avatar = extractProfileImage(html, finalUrl);\n    return { avatar, profileUrl: finalUrl, html };\n"
s = replace_once(s, old_fetch_return, new_fetch_return, "fetchProfilePage return")

start = s.index("export async function resolveProfileAvatar(input = {}) {")
# Function is last exported function in this file; replace to EOF.
old_func = s[start:]
new_func = r'''export async function resolveProfileAvatar(input = {}) {
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
'''
s = s[:start] + new_func
p.write_text(s)

# ---------------------------------------------------------------------
# 3) Server:
#    - when Auto detects Pump/Fomo/X, persist the detected platform
#    - repair already-saved duplicated Auto/profile avatars once at startup
# ---------------------------------------------------------------------
p = Path("server.mjs")
s = p.read_text()

old_platform = "    const profilePlatform=normalizeProfilePlatform(b.profilePlatform||b.platform||'auto');"
new_platform = "    let profilePlatform=normalizeProfilePlatform(b.profilePlatform||b.platform||'auto');"
s = replace_once(s, old_platform, new_platform, "create entity profilePlatform const->let")

old_resolve = r'''      if(!profileUrl&&resolved.profileUrl)profileUrl=clean(resolved.profileUrl,1000);
      if(resolved.avatar){
        avatar=resolved.avatar;
        avatarSource=resolved.source||'profile';
      }
'''
new_resolve = r'''      if(!profileUrl&&resolved.profileUrl)profileUrl=clean(resolved.profileUrl,1000);
      if(profilePlatform==='auto' && resolved.platform && resolved.platform!=='auto'){
        profilePlatform=normalizeProfilePlatform(resolved.platform);
      }
      if(resolved.avatar){
        avatar=resolved.avatar;
        avatarSource=resolved.source||'profile';
      }
'''
s = replace_once(s, old_resolve, new_resolve, "persist auto-detected platform")

api_marker = "\nasync function api(req, res, db, url, live) {"
require(s, api_marker, "api function marker")

if "SHADOW_REPAIR_AUTO_PROFILE_AVATARS_V351" not in s:
    repair_fn = r'''
/* SHADOW_REPAIR_AUTO_PROFILE_AVATARS_V351 */
async function repairDuplicateAutoProfileAvatars(db){
  const rows=db.prepare(`
    SELECT e.*
    FROM entities e
    JOIN (
      SELECT avatar
      FROM entities
      WHERE COALESCE(profile_platform,'auto')='auto'
        AND COALESCE(avatar_source,'')='profile'
        AND COALESCE(profile_handle,'')<>''
        AND COALESCE(avatar,'')<>''
      GROUP BY avatar
      HAVING COUNT(*)>1
    ) duplicated ON duplicated.avatar=e.avatar
    WHERE COALESCE(e.profile_platform,'auto')='auto'
      AND COALESCE(e.avatar_source,'')='profile'
      AND COALESCE(e.profile_handle,'')<>''
      AND COALESCE(e.avatar,'')<>''
    ORDER BY e.created_at,e.id
  `).all();

  if(!rows.length)return {checked:0,updated:0};

  const mainWallet=db.prepare(`
    SELECT address
    FROM wallets
    WHERE entity_id=?
    ORDER BY created_at
    LIMIT 1
  `);

  const updateEntity=db.prepare(`
    UPDATE entities
    SET avatar=?,avatar_source=?,profile_platform=?,profile_url=?
    WHERE id=?
  `);

  const updateCopiedWalletAvatar=db.prepare(`
    UPDATE wallets
    SET avatar=?,avatar_source=?
    WHERE entity_id=? AND avatar=?
  `);

  let updated=0;

  for(const entity of rows){
    const oldAvatar=String(entity.avatar||'');
    const handle=String(entity.profile_handle||'').trim();
    if(!handle)continue;

    let resolved=null;
    try{
      // Deliberately ignore the old profile_url: it may be the incorrect
      // fomo.family/profile/<pump-handle> URL created by the old Auto logic.
      resolved=await resolveProfileAvatar({
        platform:'auto',
        handle,
        profileUrl:''
      });
    }catch{}

    let avatar=String(resolved?.avatar||'').trim();
    let source=String(resolved?.source||'pending');
    let detected=normalizeProfilePlatform(resolved?.platform||'auto');
    let newProfileUrl=String(resolved?.profileUrl||'').trim();

    if(!avatar){
      const wallet=mainWallet.get(entity.id);
      if(wallet?.address){
        try{
          const fallback=await resolveWalletAvatar(wallet.address);
          avatar=String(fallback?.avatar||'').trim();
          source=String(fallback?.source||'generated');
          if(source==='pump.fun')detected='pump.fun';
        }catch{}
      }
    }

    // Never leave the known duplicated generic Fomo image in place.
    if(!avatar || avatar===oldAvatar){
      avatar='';
      source='pending';
      detected='auto';
      newProfileUrl='';
    }

    updateEntity.run(
      avatar,
      source,
      detected,
      newProfileUrl,
      entity.id
    );

    updateCopiedWalletAvatar.run(
      avatar,
      source,
      entity.id,
      oldAvatar
    );

    updated++;
  }

  return {checked:rows.length,updated};
}
/* SHADOW_REPAIR_AUTO_PROFILE_AVATARS_V351_END */
'''
    s = s.replace(api_marker, "\n" + repair_fn + api_marker, 1)

old_startup_vars = r'''  let tokenImageBackfillTimer=null;
  let shadowPushStop=()=>{};
'''
new_startup_vars = r'''  let tokenImageBackfillTimer=null;
  let profileAvatarRepairTimer=null;
  let shadowPushStop=()=>{};
'''
s = replace_once(s, old_startup_vars, new_startup_vars, "startup timer vars")

old_auto_monitor = r'''  if(autoMonitor){
    tokenImageBackfillTimer=setTimeout(()=>{
      backfillMissingTokenImages(db)
'''
new_auto_monitor = r'''  if(autoMonitor){
    profileAvatarRepairTimer=setTimeout(()=>{
      repairDuplicateAutoProfileAvatars(db)
        .then(result=>{
          if(result?.updated)console.log(`Profile avatar repair: ${result.updated}/${result.checked} updated`);
        })
        .catch(error=>console.warn('Profile avatar repair failed:',error.message));
    },700);
    profileAvatarRepairTimer.unref?.();

    tokenImageBackfillTimer=setTimeout(()=>{
      backfillMissingTokenImages(db)
'''
s = replace_once(s, old_auto_monitor, new_auto_monitor, "startup repair scheduler")

old_close = "  server.on('close',()=>{ try{shadowPushStop();}catch{} try{internalCopyEngine.stop();}catch{} if(tokenImageBackfillTimer)clearTimeout(tokenImageBackfillTimer); try{live.stop();}catch{} try{db.close();}catch{} });"
new_close = "  server.on('close',()=>{ try{shadowPushStop();}catch{} try{internalCopyEngine.stop();}catch{} if(profileAvatarRepairTimer)clearTimeout(profileAvatarRepairTimer); if(tokenImageBackfillTimer)clearTimeout(tokenImageBackfillTimer); try{live.stop();}catch{} try{db.close();}catch{} });"
s = replace_once(s, old_close, new_close, "server close cleanup")

p.write_text(s)

print("Patched:")
print("  src/adapters/pump-profile.mjs")
print("  src/adapters/profile-avatar.mjs")
print("  server.mjs")
PY

node --check src/adapters/pump-profile.mjs
node --check src/adapters/profile-avatar.mjs
node --check server.mjs

echo
echo "Shadow Auto profile/avatar fix applied successfully."
echo "Existing duplicated Auto/profile avatars will be repaired on the next normal app start."
echo "No server restart was performed."
