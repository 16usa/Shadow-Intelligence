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

for f in server.mjs src/adapters/profile-avatar.mjs; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 - <<'PY'
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------
# profile-avatar.mjs
# ---------------------------------------------------------------------
p = Path("src/adapters/profile-avatar.mjs")
s = p.read_text()

if "function normalizedImageIdentity" not in s:
    marker = "function metaContent(tag) {\n"
    if marker not in s:
        raise SystemExit("ERROR: metaContent marker not found")
    helper = r'''function normalizedImageIdentity(value) {
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const url=new URL(raw);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname}`;
  }catch{
    return raw.split(/[?#]/,1)[0];
  }
}

'''
    s = s.replace(marker, helper + marker, 1)

old_head = r'''export async function resolveProfileAvatar(input = {}) {
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
'''

new_head = r'''export async function resolveProfileAvatar(input = {}) {
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
'''
s = replace_once(s, old_head, new_head, "profile resolver head")

old_fomo_compare = "      if(fomoHomeImage && result.avatar===fomoHomeImage)continue;\n"
new_fomo_compare = r'''      if(
        fomoHomeImage &&
        normalizedImageIdentity(result.avatar)===normalizedImageIdentity(fomoHomeImage)
      )continue;
'''
s = replace_once(s, old_fomo_compare, new_fomo_compare, "Fomo generic image compare")

p.write_text(s)

# ---------------------------------------------------------------------
# server.mjs
# ---------------------------------------------------------------------
p = Path("server.mjs")
s = p.read_text()

old_create_call = r'''      const resolved=await resolveProfileAvatar({
        platform:profilePlatform,
        handle:profileHandle,
        profileUrl
      });
'''
new_create_call = r'''      const resolved=await resolveProfileAvatar({
        platform:profilePlatform,
        handle:profileHandle,
        profileUrl,
        wallet
      });
'''
s = replace_once(s, old_create_call, new_create_call, "create resolver call")

start_marker = "/* SHADOW_REPAIR_AUTO_PROFILE_AVATARS_V351 */"
end_marker = "/* SHADOW_REPAIR_AUTO_PROFILE_AVATARS_V351_END */"
if start_marker not in s or end_marker not in s:
    raise SystemExit("ERROR: old repair markers not found")

start = s.index(start_marker)
end = s.index(end_marker, start) + len(end_marker)

new_repair = r'''/* SHADOW_REPAIR_AUTO_PROFILE_AVATARS_V352 */
async function repairDuplicateAutoProfileAvatars(db){
  /*
   * v351 repaired only rows whose avatar URL was byte-for-byte duplicated.
   * Fomo can serve the same generic artwork through different URLs/query
   * strings, so visually duplicated avatars escaped that filter.
   *
   * v352 re-resolves every legacy Auto Entity with a handle unless its avatar
   * was set manually. Once a real platform is detected, profile_platform is
   * changed away from "auto", so that Entity drops out of future repair runs.
   */
  const rows=db.prepare(`
    SELECT e.*
    FROM entities e
    WHERE COALESCE(e.profile_platform,'auto')='auto'
      AND COALESCE(TRIM(e.profile_handle),'')<>''
      AND COALESCE(e.avatar_source,'')<>'manual'
    ORDER BY e.created_at,e.id
  `).all();

  if(!rows.length)return {checked:0,updated:0,failed:0};

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

  const updateWallets=db.prepare(`
    UPDATE wallets
    SET avatar=?,avatar_source=?
    WHERE entity_id=? AND avatar_source<>'manual'
  `);

  let updated=0;
  let failed=0;

  for(const entity of rows){
    const handle=String(entity.profile_handle||'').trim();
    const wallet=String(mainWallet.get(entity.id)?.address||'').trim();
    if(!handle)continue;

    let resolved=null;
    try{
      resolved=await resolveProfileAvatar({
        platform:'auto',
        handle,
        profileUrl:'',
        wallet
      });
    }catch(error){
      console.warn(`Profile avatar re-resolve failed for ${entity.name||entity.id}:`,error.message);
    }

    let avatar=String(resolved?.avatar||'').trim();
    let source=String(resolved?.source||'pending');
    let detected=normalizeProfilePlatform(resolved?.platform||'auto');
    let newProfileUrl=String(resolved?.profileUrl||'').trim();

    if(!avatar && wallet){
      try{
        const fallback=await resolveWalletAvatar(wallet);
        avatar=String(fallback?.avatar||'').trim();
        source=String(fallback?.source||'generated');
        if(source==='pump.fun')detected='pump.fun';
        else detected='auto';
        if(source!=='pump.fun')newProfileUrl='';
      }catch(error){
        console.warn(`Wallet avatar fallback failed for ${entity.name||entity.id}:`,error.message);
      }
    }

    if(!avatar){
      failed++;
      updateEntity.run('', 'pending', 'auto', '', entity.id);
      updateWallets.run('', 'pending', entity.id);
      console.log(`Profile avatar repair cleared stale avatar: ${entity.name||entity.id}`);
      continue;
    }

    updateEntity.run(
      avatar,
      source,
      detected,
      newProfileUrl,
      entity.id
    );
    updateWallets.run(
      avatar,
      source,
      entity.id
    );

    updated++;
    console.log(
      `Profile avatar repair: ${entity.name||entity.id} -> ${detected} (${source})`
    );
  }

  return {checked:rows.length,updated,failed};
}
/* SHADOW_REPAIR_AUTO_PROFILE_AVATARS_V352_END */'''

s = s[:start] + new_repair + s[end:]
p.write_text(s)

print("Patched:")
print("  src/adapters/profile-avatar.mjs")
print("  server.mjs")
PY

node --check src/adapters/profile-avatar.mjs
node --check server.mjs

echo
echo "Shadow Auto profile/avatar fix v2 applied successfully."
echo "v2 re-checks every legacy Auto Entity with a handle, not only exact duplicate URLs."
echo "No server restart was performed."
