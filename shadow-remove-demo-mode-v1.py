
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# 1) Remove Demo data mode from Settings UI
p = Path("public/index.html")
s = p.read_text()
old = '<label class="si-toggle"><span>Demo data mode</span><input id="setDemo" type="checkbox"/></label>'
s = replace_once(s, old, '', "Demo data mode UI")
p.write_text(s)

# 2) Remove client load/save references
p = Path("public/app.js")
s = p.read_text()

old_load = "    $('#setDemo').checked=s.demo_mode==='true';\n"
s = replace_once(s, old_load, '', "setDemo load")

old_save = "copy_trading_enabled:$('#setCopy').checked,demo_mode:$('#setDemo').checked,live_monitor_enabled:"
new_save = "copy_trading_enabled:$('#setCopy').checked,live_monitor_enabled:"
s = replace_once(s, old_save, new_save, "setDemo save")
p.write_text(s)

# 3) Retire demo_mode from mutable server settings
p = Path("server.mjs")
s = p.read_text()
old_allowed = "'copy_trading_enabled','demo_mode','live_monitor_enabled'"
new_allowed = "'copy_trading_enabled','live_monitor_enabled'"
s = replace_once(s, old_allowed, new_allowed, "server demo_mode allowlist")
p.write_text(s)

# 4) Make demo seeding impossible for normal startup
p = Path("src/db.mjs")
s = p.read_text()

old_startup = "  if (getSetting(db,'demo_mode','false') === 'true') seedDemo(db);\n"
s = replace_once(s, old_startup, '', "demo seed startup hook")

old_default = "    demo_mode:'false', live_monitor_enabled:'true',"
new_default = "    live_monitor_enabled:'true',"
s = replace_once(s, old_default, new_default, "demo_mode default")

p.write_text(s)

print("Retired Demo data mode from:")
print("  public/index.html")
print("  public/app.js")
print("  server.mjs")
print("  src/db.mjs")
