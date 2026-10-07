from pathlib import Path
import re
import shutil

html_path = Path("public/sync.html")

if not html_path.exists():
    raise SystemExit("ERROR: public/sync.html not found. Run this from the project root.")

html = html_path.read_text(encoding="utf-8")

backup = Path("public/sync.html.before-restore-all-frogs")
if not backup.exists():
    shutil.copy2(html_path, backup)

changed = []

# Restore original background/hero artwork block if missing.
if 'class="sync-pepe-art"' not in html and "class='sync-pepe-art'" not in html:
    hero_open = re.search(r'(<section\s+class=["\']hero["\'][^>]*>)', html, flags=re.I)
    if not hero_open:
        raise SystemExit("ERROR: .hero section not found.")

    block = (
        '\n      <div class="sync-pepe-art" aria-hidden="true">\n'
        '        <img src="/assets/sync-pepe-hero.png?v=1" alt="">\n'
        '      </div>'
    )

    insert_at = hero_open.end()
    html = html[:insert_at] + block + html[insert_at:]
    changed.append("sync-pepe-art restored")

# Restore the second original Pepe hero image if missing.
if not re.search(r'<img\b[^>]*\bclass=["\'][^"\']*\bpepe-hero\b[^"\']*["\'][^>]*>', html, flags=re.I):
    leader_line = re.search(
        r'(<div\s+id=["\']leaderLine["\'][^>]*>.*?</div>)',
        html,
        flags=re.I | re.S
    )
    if not leader_line:
        raise SystemExit("ERROR: #leaderLine not found.")

    img = '\n      <img class="pepe-hero" src="/sync-pepe-hero.png?v=1" alt="" aria-hidden="true">'
    insert_at = leader_line.end()
    html = html[:insert_at] + img + html[insert_at:]
    changed.append("pepe-hero restored")

html_path.write_text(html, encoding="utf-8")

print("SYNC_RESTORE_ALL_FROG_IMAGES_OK")
if changed:
    for item in changed:
        print(item)
else:
    print("Both original frog images were already present.")
print("No CSS, leader badge, online dot, text, or layout settings were changed.")
