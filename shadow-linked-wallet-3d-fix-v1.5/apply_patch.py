from pathlib import Path

ROOT = Path.cwd()
APP = ROOT / 'public' / 'app.js'

if not APP.exists():
    raise SystemExit('ERROR: expected public/app.js in the current Shadow workspace')

text = APP.read_text()

if 'SHADOW_LINKED_WALLET_3D_V15' in text:
    print('Patch v1.5 is already installed; nothing to change.')
    raise SystemExit(0)

# v1.5 is intentionally layered on top of the linked-wallet payload from v1.4.
# The entity list already has entity.linkedWallets, but entityDetail previously used
# only d.wallets. Merge both sources so every linked wallet is passed to ShadowGraph.
anchor = '''function entityDetail(d){\n'''
helper = '''/* SHADOW_LINKED_WALLET_3D_V15 */\nfunction entityDetailLinkedWallets(d,e){\n  const sources=[\n    ...(Array.isArray(e?.linkedWallets)?e.linkedWallets:[]),\n    ...(Array.isArray(d?.linkedWallets)?d.linkedWallets:[]),\n    ...(Array.isArray(d?.wallets)?d.wallets:[])\n  ];\n\n  const byKey=new Map();\n  const order=[];\n\n  for(const raw of sources){\n    if(!raw)continue;\n    const address=String(raw.address||'').trim();\n    const id=String(raw.id||'').trim();\n    const key=address||id;\n    if(!key)continue;\n\n    if(!byKey.has(key))order.push(key);\n    byKey.set(key,{\n      ...(byKey.get(key)||{}),\n      ...raw,\n      entity_id:raw.entity_id||e?.id||''\n    });\n  }\n\n  return order.map(key=>byKey.get(key));\n}\n/* SHADOW_LINKED_WALLET_3D_V15_END */\n\nfunction entityDetail(d){\n'''

count = text.count(anchor)
if count != 1:
    raise SystemExit(f'ERROR: entityDetail anchor: expected exactly 1 match, found {count}. No patch applied.')
text = text.replace(anchor, helper, 1)

old = '''  const wallets=Array.isArray(d?.wallets)?d.wallets:[];\n'''
new = '''  // v1.5: detail response can be stale/main-wallet-only while /api/entities\n  // already contains every linked wallet from v1.4. Merge + dedupe both sources\n  // before rendering the profile, activity graph, and 3D network.\n  const wallets=entityDetailLinkedWallets(d,e);\n'''

count = text.count(old)
if count != 1:
    raise SystemExit(f'ERROR: detail wallets source: expected exactly 1 match, found {count}. No patch applied.')
text = text.replace(old, new, 1)

APP.write_text(text)
print('Patch v1.5 applied: entity detail / 3D now receives every linked wallet.')
