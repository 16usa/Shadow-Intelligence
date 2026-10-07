#!/usr/bin/env python3
from pathlib import Path
import shutil, re

ROOT = Path.cwd()
SERVER = ROOT / "server.mjs"
MARK = "SYNC_LEADER_HELIUS_REFRESH_V19B"

if not SERVER.is_file():
    raise SystemExit("ERROR: server.mjs not found. Run from ~/workspace.")

text = SERVER.read_text()

if MARK in text:
    print("SYNC LEADER HELIUS REFRESH V19B ALREADY INSTALLED")
    raise SystemExit(0)

backup = ROOT / "server.mjs.bak-leader-helius-v19b"
shutil.copy2(SERVER, backup)

route_pat = re.compile(
    r"if\s*\(\s*route\s*===\s*['\"]/api/public-copy-room/config['\"]\s*&&\s*method\s*===\s*['\"]PUT['\"]\s*\)\s*\{",
    re.M
)
m = route_pat.search(text)
if not m:
    raise SystemExit("ERROR: public-copy-room PUT route not found. No files changed.")

start = m.start()

section_end = text.find("/* SHADOW_PUBLIC_COPY_ROOM_V100_END */", m.end())
if section_end < 0:
    section_end = text.find("if (route === '/api/settings'", m.end())
if section_end < 0:
    raise SystemExit("ERROR: end of public-copy-room section not found. No files changed.")

block = text[start:section_end]

enabled_pat = re.compile(
    r"(stmt\.run\(\s*['\"]public_copy_room_enabled['\"]\s*,\s*body\.enabled\s*===\s*false\s*\?\s*['\"]false['\"]\s*:\s*['\"]true['\"]\s*\)\s*;)",
    re.M
)
em = enabled_pat.search(block)
if not em:
    raise SystemExit("ERROR: room-enabled save line not found. No files changed.")

insertion = r'''

    /* SYNC_LEADER_HELIUS_REFRESH_V19B */
    // Rebind realtime Helius monitoring immediately whenever Room setup changes.
    let selectedLeaderWallet=null;
    if(entityId){
      selectedLeaderWallet=mainCopyWalletRows(db,entityId)[0]||null;
      if(selectedLeaderWallet?.id){
        db.prepare("UPDATE wallets SET monitoring_enabled=1 WHERE id=?").run(selectedLeaderWallet.id);
      }
    }

    let heliusRealtime=null;
    try{
      heliusRealtime=await live.refreshRealtimeWebhook();
    }catch(error){
      console.warn('SYNC leader Helius refresh failed:',String(error?.message||error));
      heliusRealtime={active:false,lastError:String(error?.message||error)};
    }
    /* SYNC_LEADER_HELIUS_REFRESH_V19B_END */
'''

insert_at = start + em.end()
patched = text[:insert_at] + insertion + text[insert_at:]

response_pat = re.compile(
    r"(leaderEntityId\s*:\s*entityId\s*)(\n?\s*\}\s*\)\s*;)",
    re.M
)
rm = response_pat.search(patched, insert_at, section_end + len(insertion) + 2000)
if rm:
    replacement = (
        "leaderEntityId:entityId,\n"
        "      leaderWalletId:selectedLeaderWallet?.id||'',\n"
        "      helius:{\n"
        "        active:!!heliusRealtime?.active,\n"
        "        addressCount:Number(heliusRealtime?.addressCount||0),\n"
        "        lastConfigAt:String(heliusRealtime?.lastConfigAt||''),\n"
        "        lastError:String(heliusRealtime?.lastError||'')\n"
        "      }"
        + rm.group(2)
    )
    patched = patched[:rm.start()] + replacement + patched[rm.end():]

SERVER.write_text(patched)

print("SYNC LEADER HELIUS REFRESH V19B INSTALLED")
print("Backup:", backup)
print("Behavior:")
print("  SAVE ROOM -> selected leader Main Wallet monitoring ON -> immediate Helius webhook refresh")
print("No Program ID, private keys, vault balances, TP/SL, or copy sizing changed.")
