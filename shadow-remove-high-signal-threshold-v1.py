
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# 1) Remove unused field from Settings UI
p = Path("public/index.html")
s = p.read_text()
old = '<label>High signal threshold<input id="setRiskThreshold" class="si-input" type="number" min="1" max="100"/></label>'
if old in s:
    s = s.replace(old, '', 1)
else:
    raise SystemExit("ERROR: High signal threshold UI field not found")
p.write_text(s)

# 2) Remove unused client-side load/save references
p = Path("public/app.js")
s = p.read_text()

old_load = "    $('#setRiskThreshold').value=s.risk_high_threshold||80;\n"
if old_load not in s:
    raise SystemExit("ERROR: setRiskThreshold load reference not found")
s = s.replace(old_load, '', 1)

old_save = "copy_trading_enabled:$('#setCopy').checked,risk_high_threshold:$('#setRiskThreshold').value,demo_mode:"
new_save = "copy_trading_enabled:$('#setCopy').checked,demo_mode:"
s = replace_once(s, old_save, new_save, "settings save risk threshold")
p.write_text(s)

# 3) Stop accepting the obsolete setting through the settings API
p = Path("server.mjs")
s = p.read_text()
old_allowed = "'copy_trading_enabled','risk_high_threshold','demo_mode'"
new_allowed = "'copy_trading_enabled','demo_mode'"
s = replace_once(s, old_allowed, new_allowed, "server settings allowlist")
p.write_text(s)

# 4) Stop seeding the obsolete setting for new databases
p = Path("src/db.mjs")
s = p.read_text()
old_default = "    risk_high_threshold:'80', demo_mode:'false',"
new_default = "    demo_mode:'false',"
s = replace_once(s, old_default, new_default, "database default setting")
p.write_text(s)

print("Removed unused High signal threshold from:")
print("  public/index.html")
print("  public/app.js")
print("  server.mjs")
print("  src/db.mjs")
