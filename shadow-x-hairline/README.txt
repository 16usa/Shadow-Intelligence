Shadow Intelligence — X-style Retina hairline patch v2.4.9

Purpose
- Keep the X-style neutral line colors already chosen:
  Light: #EFF3F4
  Dark:  #2F3336
- Change neutral Shadow borders/dividers that use --si-line from 1px to 0.5px.
- Keep semantic colored borders unchanged (red destructive, green active,
  blue focus, notification badge, live beacon, etc.).
- Normalize legacy --imm-line to --si-line if it still exists.
- Update the stylesheet cache-buster.
- Create a backup automatically.

Install
1. Upload Shadow-X-Hairline-v2.4.9.zip to ~/workspace
2. Run:
   cd ~/workspace && rm -rf shadow-x-hairline && unzip -o Shadow-X-Hairline-v2.4.9.zip -d shadow-x-hairline && bash shadow-x-hairline/install.sh

Rollback
   cd ~/workspace && bash shadow-x-hairline/rollback.sh
