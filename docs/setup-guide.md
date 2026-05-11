# SP Popups × Slack — Setup Guide

Get real-time Slack notifications for every new lead from your SendPulse popups in 3 steps.

## Step 1 — Install from the SP Marketplace

1. In your SendPulse account, go to **Apps → App Directory**.
2. Find **SP Popups × Slack** and click **Install**.
3. Approve the requested permissions (`pop_ups` read scope).
4. The app opens automatically inside your SP dashboard.

## Step 2 — Connect your Slack workspace

1. In the app panel, click **Add to Slack**.
2. You'll be redirected to Slack — sign in if prompted.
3. Select the **channel** where you want to receive lead alerts (e.g. `#new-leads`).
4. Click **Allow**.
5. You'll be returned to the app with a unique **webhook URL**.

## Step 3 — Paste the URL in your popup settings (one time per popup)

1. In SendPulse, open the popup you want to track.
2. Go to **Settings → Integrations**.
3. Click **+ Add Webhook URL**.
4. Paste the URL copied from Step 2.
5. Tick **"Send lead creation data"**.
6. Click **Save**.

That's it! Every time a visitor submits the popup, your Slack channel gets an instant notification.

---

## What data is sent to Slack?

| Field | Source |
|---|---|
| Name | Popup form field |
| Email | Popup form field |
| Phone | Popup form field (if collected) |
| Custom fields | Any extra variables you configured in SP |
| Popup name | Sent by SP in the webhook payload |
| Timestamp | Time the lead arrived at our server |

## Troubleshooting

**I'm not receiving test leads.**
- Make sure you clicked **Send test lead** inside the app and it showed "✓ Sent".
- If not, try disconnecting and reconnecting Slack.

**Real popup submissions aren't appearing.**
- Double-check you saved the webhook URL in every popup you want tracked (Step 3 must be done per popup).
- Ensure the webhook URL is exactly as shown — no trailing spaces.

**I moved my Slack workspace / channel.**
- Click **Disconnect Slack** in the app and repeat Step 2 to select a new channel.

## Privacy & data

- We store: your SP user ID, your Slack webhook URL, and a log of received leads (email + name only).
- All data is deleted immediately when you uninstall the app from SP.
- We do not share your data with third parties.
