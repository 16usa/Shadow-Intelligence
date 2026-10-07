#!/usr/bin/env python3
from pathlib import Path
import zipfile, re, json, os

BASE=Path.cwd()
OUT=BASE/"SYNC_EXECUTOR_V14_CURRENT.zip"

# Only source/config files relevant to copy execution. Explicitly excludes secrets,
# databases, node_modules, git internals, keypairs, env files and build artifacts.
candidates = [
    "server.mjs",
    "package.json",
    "package-lock.json",
    "src/internal-copy-engine.mjs",
    "src/adapters/copy-trading.mjs",
    "src/live-intelligence.mjs",
    "src/db.mjs",
]
patterns = [
    "src/**/*executor*.mjs","src/**/*executor*.js",
    "src/**/*copy*.mjs","src/**/*copy*.js",
    "src/**/*jupiter*.mjs","src/**/*jupiter*.js",
    "src/**/*pump*.mjs","src/**/*pump*.js",
    "scripts/**/*delegated*.mjs","scripts/**/*delegated*.js",
    "scripts/**/*executor*.mjs","scripts/**/*executor*.js",
    "scripts/**/*24x7*.mjs","scripts/**/*24x7*.js",
    "solana/**/*.rs","solana/**/Cargo.toml","solana/**/Anchor.toml",
]

blocked_names={".env",".env.local",".env.production","id.json","keypair.json","wallet.json"}
blocked_parts={"node_modules",".git","target","dist","build",".cargo",".rustup"}

files=set()
for rel in candidates:
    p=BASE/rel
    if p.is_file(): files.add(p)
for pat in patterns:
    for p in BASE.glob(pat):
        if not p.is_file(): continue
        rel=p.relative_to(BASE)
        if any(part in blocked_parts for part in rel.parts): continue
        low=p.name.lower()
        if low in blocked_names or low.endswith("-keypair.json") or low.endswith(".key"):
            continue
        files.add(p)

# Redact common literal secrets if any source file accidentally contains one.
secret_line=re.compile(r'(?i)^(\s*(?:private[_-]?key|secret[_-]?key|api[_-]?key|helius[_-]?key|auth[_-]?token|bearer[_-]?token)\s*[:=]\s*)(.+)$')
pem=re.compile(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----',re.S)

manifest=[]
with zipfile.ZipFile(OUT,"w",zipfile.ZIP_DEFLATED) as z:
    for p in sorted(files,key=lambda x:str(x)):
        rel=str(p.relative_to(BASE))
        try:
            data=p.read_text(errors="strict")
        except Exception:
            continue
        data=pem.sub("[REDACTED_PRIVATE_KEY]",data)
        data="\n".join(secret_line.sub(lambda m:m.group(1)+"[REDACTED]",line) for line in data.splitlines())+"\n"
        z.writestr(rel,data)
        manifest.append(rel)
    z.writestr("_SYNC_EXPORT_MANIFEST.txt","\n".join(manifest)+"\n")

print(f"CREATED: {OUT.name}")
print(f"FILES: {len(manifest)}")
print("No .env, database, keypair, private-key, node_modules, .git or target files included.")
