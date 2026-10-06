# Shadow SYNC Push + Option 1 v4

This patch adds **Trade alerts** to `/sync` and corrects the logo to the chosen **Option 1 / Fusion Mark**.

## Notification behavior
- User turns on **Trade alerts**
- SYNC subscribes the device to the existing Shadow Web Push system
- The room's Leader Entity is enabled in that user's notification preferences
- Leader BUY / SELL activity can arrive as system push while SYNC is closed
- Turning SYNC Trade alerts off disables that Leader alert, but does not remove the device's push subscription, so other Shadow alerts are not broken
- **Send test notification** appears when the device is active

### iPhone
For iOS Web Push, add SYNC to the Home Screen first:
**Share → Add to Home Screen → open SYNC from the Home Screen icon → enable Trade alerts**

## Install
From the Shadow-Intelligence repository root:

```bash
unzip -o shadow-sync-push-option1-v4.zip
bash shadow-sync-push-option1-v4/install.sh
```

The patch does **not** restart Replit automatically.
