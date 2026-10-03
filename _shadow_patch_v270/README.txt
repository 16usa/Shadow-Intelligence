Shadow Intelligence — Universal Profile Sources + Duplicate Wallet Check v2.7.0

WHAT THIS PATCH ADDS
- Universal profile source fields: Auto, Fomo, Pump.fun, X, Other site.
- Separate Username / handle from X handle, so a Fomo username is no longer treated as an X account.
- Profile URL support for any public HTTPS profile page.
- Automatic avatar lookup:
  1) manual Avatar URL if supplied
  2) selected profile page (including Fomo handle -> fomo.family/profile/<handle>)
  3) Pump.fun wallet profile fallback
  4) generated wallet avatar fallback
- Immediate duplicate Solana wallet check while typing/pasting the wallet.
- Existing account name/avatar/source is shown when a duplicate wallet is found.
- Create button is disabled for duplicate wallets.
- Server-side duplicate protection as well, so a race condition cannot create a second entity.
- Entity + initial wallet are created together; no orphan entity is left behind if the wallet already exists.
- Existing X monitoring remains separate and unchanged.

INSTALL FROM REPLIT SHELL
1) Upload the ZIP into the EXISTING Shadow Intelligence workspace.
2) Run:
   unzip -o Shadow-Universal-Profiles-v2.7.0.zip
   bash _shadow_patch_v270/install.sh

The installer does NOT restart the server.

PUSH AFTER TESTS PASS
git add server.mjs public/app.js src/db.mjs src/adapters/profile-avatar.mjs
git commit -m "Add universal entity profiles and duplicate wallet check"
git push

Then restart manually from the Replit Console.

ROLLBACK
bash _shadow_patch_v270/rollback.sh
Then restart manually from the Replit Console.
