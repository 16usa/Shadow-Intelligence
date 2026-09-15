Shadow Intelligence — X-style line unification v2.4.8

What this patch does
- Keeps one neutral line system across the site.
- Light theme: #EFF3F4
- Dark theme: #2F3336
- Neutral border/divider width remains 1px.
- Removes the duplicate --imm-line neutral token.
- Repoints immersive UI borders to --si-line.
- Does NOT change semantic colored states such as destructive red, active green,
  focus blue, notification badge, or live beacon states.
- Updates the CSS cache-buster in public/index.html.
- Creates an automatic backup before changing files.

Install from Replit Shell
1. Upload the ZIP to the project root.
2. Run:
   cd ~/workspace && rm -rf shadow-x-line-unify && unzip -o Shadow-X-Line-Unify-v2.4.8.zip -d shadow-x-line-unify && bash shadow-x-line-unify/install.sh

Rollback
   cd ~/workspace && bash shadow-x-line-unify/rollback.sh
