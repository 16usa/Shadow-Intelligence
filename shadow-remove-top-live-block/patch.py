
from pathlib import Path
import re, shutil, sys, os

ROOT = Path.cwd()
public = ROOT / "public"
index = public / "index.html"
app = public / "app.js"
css = public / "si-current.css"

backup = Path(os.environ["SHADOW_REMOVE_LIVE_BACKUP"])
removed = []
changed = []

def save_backup(path: Path):
    if not path.exists():
        return
    rel = path.relative_to(ROOT)
    dst = backup / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        shutil.copy2(path, dst)

# Find dedicated assets from the previously-added top-center live/beacon card.
patterns = [
    "*live*beacon*",
    "*beacon*card*",
    "*live*card*",
]
asset_files = []
for pat in patterns:
    asset_files.extend(public.glob(pat))

# Only accept obvious generated JS/CSS assets.
asset_files = sorted({
    p for p in asset_files
    if p.is_file()
    and p.suffix.lower() in {".js", ".css"}
    and (
        "beacon" in p.name.lower()
        or ("live" in p.name.lower() and "card" in p.name.lower())
    )
})

for p in asset_files:
    save_backup(p)

# Remove script/link references to those dedicated assets and to known
# live-beacon names from index.html.
if index.exists():
    save_backup(index)
    text = index.read_text(encoding="utf-8")
    original = text

    names = [re.escape(p.name) for p in asset_files]
    name_alt = "|".join(names) if names else r"(?!)"

    # Dedicated external script references.
    text = re.sub(
        rf'\s*<script\b[^>]*\bsrc=["\'][^"\']*(?:{name_alt}|si-live-beacon[^"\']*|live-beacon-card[^"\']*)["\'][^>]*>\s*</script>\s*',
        "\n",
        text,
        flags=re.I,
    )

    # Dedicated external stylesheet references.
    text = re.sub(
        rf'\s*<link\b[^>]*\bhref=["\'][^"\']*(?:{name_alt}|si-live-beacon[^"\']*|live-beacon-card[^"\']*)["\'][^>]*>\s*',
        "\n",
        text,
        flags=re.I,
    )

    # Marker-wrapped inline blocks, if an older installer put the code inline.
    marker_pairs = [
        ("SHADOW_LIVE_BEACON_CARD", "SHADOW_LIVE_BEACON_CARD_END"),
        ("SHADOW_LIVE_BEACON", "SHADOW_LIVE_BEACON_END"),
        ("SHADOW_LIVE_ACTIVITY_CARD", "SHADOW_LIVE_ACTIVITY_CARD_END"),
    ]
    for start, end in marker_pairs:
        text = re.sub(
            rf'/\*\s*{re.escape(start)}[^*]*\*/.*?/\*\s*{re.escape(end)}\s*\*/',
            "",
            text,
            flags=re.S | re.I,
        )

    if text != original:
        index.write_text(text, encoding="utf-8")
        changed.append(str(index))

# Remove marker-wrapped JS implementation if it was inserted into app.js.
if app.exists():
    save_backup(app)
    text = app.read_text(encoding="utf-8")
    original = text

    marker_patterns = [
        r'/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[_ -]CARD[^*]*\*/.*?/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[_ -]CARD[_ -]END\s*\*/',
        r'/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[^*]*\*/.*?/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[_ -]END\s*\*/',
        r'/\*\s*SHADOW[_ -]LIVE[_ -]ACTIVITY[_ -]CARD[^*]*\*/.*?/\*\s*SHADOW[_ -]LIVE[_ -]ACTIVITY[_ -]CARD[_ -]END\s*\*/',
    ]
    for pat in marker_patterns:
        text = re.sub(pat, "", text, flags=re.S | re.I)

    if text != original:
        app.write_text(text, encoding="utf-8")
        changed.append(str(app))

# Remove marker-wrapped CSS implementation if inserted into si-current.css.
if css.exists():
    save_backup(css)
    text = css.read_text(encoding="utf-8")
    original = text

    marker_patterns = [
        r'/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[_ -]CARD[^*]*\*/.*?/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[_ -]CARD[_ -]END\s*\*/',
        r'/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[^*]*\*/.*?/\*\s*SHADOW[_ -]LIVE[_ -]BEACON[_ -]END\s*\*/',
        r'/\*\s*SHADOW[_ -]LIVE[_ -]ACTIVITY[_ -]CARD[^*]*\*/.*?/\*\s*SHADOW[_ -]LIVE[_ -]ACTIVITY[_ -]CARD[_ -]END\s*\*/',
    ]
    for pat in marker_patterns:
        text = re.sub(pat, "", text, flags=re.S | re.I)

    if text != original:
        css.write_text(text, encoding="utf-8")
        changed.append(str(css))

# Delete only dedicated generated live/beacon JS/CSS assets.
for p in asset_files:
    try:
        p.unlink()
        removed.append(str(p))
    except FileNotFoundError:
        pass

# Also remove the exact known generated names if present.
for name in [
    "si-live-beacon-card.js",
    "si-live-beacon-card.css",
    "si-live-beacon.js",
    "si-live-beacon.css",
]:
    p = public / name
    if p.exists():
        save_backup(p)
        p.unlink()
        if str(p) not in removed:
            removed.append(str(p))

print("PATCH: PASS")
print("Top-center live/beacon block removal completed.")
print("Bell button and graph were not targeted.")

if removed:
    print("Removed dedicated assets:")
    for x in removed:
        print("  " + x)
else:
    print("Dedicated beacon asset files: none found.")

if changed:
    print("Changed references/inline blocks:")
    for x in changed:
        print("  " + x)
else:
    print("Inline/reference changes: none needed.")

# Useful audit: show remaining likely beacon references without changing them.
hits = []
for p in [index, app, css]:
    if not p.exists():
        continue
    for line_no, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        low = line.lower()
        if "beacon" in low and "bell" not in low:
            hits.append(f"{p}:{line_no}: {line.strip()[:180]}")

if hits:
    print()
    print("NOTICE: remaining 'beacon' references found for review:")
    for h in hits[:20]:
        print("  " + h)
