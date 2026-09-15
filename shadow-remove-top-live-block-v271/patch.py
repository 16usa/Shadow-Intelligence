
from pathlib import Path
import re, shutil, os

ROOT = Path.cwd()
PUBLIC = ROOT / "public"
INDEX = PUBLIC / "index.html"
APP = PUBLIC / "app.js"

BACKUP = Path(os.environ["SHADOW_TOP_BLOCK_BACKUP"])
changed = []
removed = []

def backup(path: Path):
    if not path.exists():
        return
    rel = path.relative_to(ROOT)
    dst = BACKUP / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        shutil.copy2(path, dst)

# These files were used by the old 24H/1H mover strip and then reused
# for the small live BUY/SELL card at the top of the overview.
DEDICATED = [
    PUBLIC / "si-top-movers.js",
    PUBLIC / "si-top-movers.css",
    PUBLIC / "si-live-beacon-card.js",
    PUBLIC / "si-live-beacon-card.css",
    PUBLIC / "si-live-beacon.js",
    PUBLIC / "si-live-beacon.css",
]

# 1) Remove their references from index.html.
backup(INDEX)
html = INDEX.read_text(encoding="utf-8")
orig_html = html

asset_names = [re.escape(p.name) for p in DEDICATED]
alt = "|".join(asset_names)

html = re.sub(
    rf'\s*<script\b[^>]*\bsrc=["\'][^"\']*(?:{alt})[^"\']*["\'][^>]*>\s*</script>\s*',
    "\n",
    html,
    flags=re.I,
)
html = re.sub(
    rf'\s*<link\b[^>]*\bhref=["\'][^"\']*(?:{alt})[^"\']*["\'][^>]*>\s*',
    "\n",
    html,
    flags=re.I,
)

# Remove known marker-wrapped inline implementations.
for name in [
    "SHADOW_TOP_24H_MOVERS",
    "SHADOW_TOP_24H_BELL",
    "SHADOW_TOP_24H_LAYOUT",
    "SHADOW_TOP_24H_NO_AVATAR",
    "SHADOW_TOP_24H_NO_MC_LABEL",
    "SHADOW_1H_FASTEST_MOVER",
    "SHADOW_LIVE_BEACON_CARD",
    "SHADOW_LIVE_BEACON",
]:
    html = re.sub(
        rf'/\*\s*{name}[^*]*\*/.*?/\*\s*{name}_END\s*\*/',
        "",
        html,
        flags=re.S | re.I,
    )

if html != orig_html:
    INDEX.write_text(html, encoding="utf-8")
    changed.append(str(INDEX))

# 2) Remove any marker-wrapped implementation accidentally injected into app.js.
backup(APP)
app = APP.read_text(encoding="utf-8")
orig_app = app

for pat in [
    r'/\*\s*SHADOW[_ -]TOP[_ -]24H[_ -][A-Z0-9_ -]+?\*/.*?/\*\s*SHADOW[_ -]TOP[_ -]24H[_ -][A-Z0-9_ -]+?_END\s*\*/',
    r'/\*\s*SHADOW[_ -]1H[_ -]FASTEST[_ -]MOVER[^*]*\*/.*?/\*\s*SHADOW[_ -]1H[_ -]FASTEST[_ -]MOVER[_ -]END\s*\*/',
    r'/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[_ -]CARD[^*]*\*/.*?/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[_ -]CARD[_ -]END\s*\*/',
]:
    app = re.sub(pat, "", app, flags=re.S | re.I)

if app != orig_app:
    APP.write_text(app, encoding="utf-8")
    changed.append(str(APP))

# 3) Delete the dedicated assets.
for p in DEDICATED:
    if p.exists():
        backup(p)
        p.unlink()
        removed.append(str(p))

# 4) Add a tiny defensive cleanup script.
# This is only a fallback for an old cached/inlined implementation.
cleanup = PUBLIC / "si-remove-top-live-card.js"
backup(cleanup)
cleanup.write_text(r"""(() => {
  function looksLikeTopLiveCard(el){
    if(!(el instanceof HTMLElement)) return false;

    const text=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
    if(!text) return false;

    const hasTrade=/\b(BUY|SELL)\b/i.test(text);
    const hasHandle=/@[A-Za-z0-9_]{2,}/.test(text);
    const hasPct=/[+-]?\d+(?:\.\d+)?%/.test(text);

    if(!(hasTrade&&hasHandle&&hasPct)) return false;

    const r=el.getBoundingClientRect();
    const vw=Math.max(document.documentElement.clientWidth,window.innerWidth||0);

    // Only target the small top-center pill, never feed rows or graph nodes.
    return r.top>=0 &&
           r.top<190 &&
           r.height>=35 &&
           r.height<=120 &&
           r.width>=180 &&
           r.width<=Math.min(520,vw*.82) &&
           r.left>20;
  }

  function remove(){
    const overview=document.querySelector('#page-overview')||document.body;
    const nodes=[...overview.querySelectorAll('div,section,article,aside')];

    for(const el of nodes){
      if(looksLikeTopLiveCard(el)){
        el.remove();
      }
    }
  }

  remove();

  const observer=new MutationObserver(()=>remove());
  observer.observe(document.documentElement,{childList:true,subtree:true});

  window.addEventListener('pageshow',remove);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)remove()});
})();""", encoding="utf-8")

# Ensure fallback runs after app.js.
html = INDEX.read_text(encoding="utf-8")
tag = '<script src="/si-remove-top-live-card.js?v=2.7.1-20260915"></script>'

html = re.sub(
    r'\s*<script[^>]+src=["\']/si-remove-top-live-card\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script>\s*',
    "\n",
    html,
    flags=re.I
)

matches = list(re.finditer(
    r'<script[^>]+src=["\']/app\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script>',
    html,
    flags=re.I
))
if not matches:
    raise SystemExit("ERROR: app.js script tag not found")

m = matches[-1]
html = html[:m.end()] + "\n" + tag + html[m.end():]
INDEX.write_text(html, encoding="utf-8")
if str(INDEX) not in changed:
    changed.append(str(INDEX))

print("PATCH: PASS")
print("Removed the actual top mover/live-card implementation.")
print("Graph entity beacons were NOT removed.")
print("Bell button was NOT removed.")
print("Removed assets:")
for p in removed:
    print("  " + p)
print("Changed:")
for p in changed:
    print("  " + p)
