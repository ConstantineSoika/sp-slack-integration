const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { sendToSlack } = require('../services/slack');
const { getPopupById } = require('../services/sp');

// SP posts URL-encoded lead data here
router.post('/webhook/:token', express.urlencoded({ extended: true }), async (req, res) => {
  // Respond immediately — SP expects 200 fast
  res.sendStatus(200);

  const { token } = req.params;
  const payload   = req.body;

  // Async processing — errors are logged, not returned
  processLead(token, payload).catch(err => {
    console.error('[webhook] unhandled error:', err.message);
  });
});

async function processLead(token, payload) {
  const config = db.prepare(`
    SELECT sc.slack_webhook_url, sc.channel_name, u.sp_user_id
    FROM   slack_configs sc
    JOIN   users u ON u.id = sc.user_id
    WHERE  sc.webhook_token = ?
  `).get(token);

  if (!config) {
    console.warn('[webhook] unknown token:', token);
    return;
  }

  const flat    = flattenVariables(payload);
  // SP sends camelCase popupId, not snake_case popup_id
  const popupId = flat.popupId || flat.popup_id || null;
  console.log('[webhook] popupId:', JSON.stringify(popupId));

  // Try to resolve the popup name from SP API (best-effort, falls back to null)
  const userId = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(config.sp_user_id)?.id;
  let popupName = flat.popup_name || null;
  if (popupId && userId && !popupName) {
    const popup = await getPopupById(userId, popupId);
    if (popup?.name) {
      popupName = popup.name;
      console.log('[webhook] resolved popup name:', popupName);
      // Cache the name in popup_routes if a route exists for this popup
      db.prepare(`UPDATE popup_routes SET popup_name = ? WHERE user_id = ? AND popup_id = ? AND (popup_name IS NULL OR popup_name = popup_id)`)
        .run(popupName, userId, popupId);
    }
  }

  // Check if any enabled routing rules exist — if none, forward everything
  const routeCount = db.prepare(
    'SELECT COUNT(*) as n FROM popup_routes WHERE user_id = (SELECT id FROM users WHERE sp_user_id = ?) AND enabled = 1'
  ).get(config.sp_user_id)?.n || 0;

  let targetWebhookUrl = config.slack_webhook_url;

  if (routeCount > 0) {
    const route = popupId
      ? db.prepare(`
          SELECT slack_webhook_url FROM popup_routes
          WHERE user_id = (SELECT id FROM users WHERE sp_user_id = ?)
            AND LOWER(TRIM(popup_id)) = LOWER(TRIM(?))
            AND enabled = 1
          LIMIT 1
        `).get(config.sp_user_id, popupId)
      : null;

    if (!route) {
      console.log(`[webhook] popupId ${popupId} not in routing rules — dropped`);
      db.prepare(`INSERT INTO event_log (sp_user_id, popup_id, popup_name, lead_email, lead_name, slack_status, error_msg) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(config.sp_user_id, popupId, popupName, flat.email || null, flat.name || null, 'dropped', `popup not in routes`);
      return;
    }
    targetWebhookUrl = route.slack_webhook_url;
  }

  let slackStatus = 'ok';
  let errorMsg    = null;

  try {
    await sendToSlack(targetWebhookUrl, flat);
  } catch (err) {
    slackStatus = 'error';
    errorMsg    = err.message;
    console.error(`[webhook] Slack send failed for user ${config.sp_user_id}:`, err.message);
  }

  db.prepare(`
    INSERT INTO event_log (sp_user_id, popup_id, popup_name, lead_email, lead_name, slack_status, error_msg)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(config.sp_user_id, popupId, popupName, flat.email || null, flat.name || null, slackStatus, errorMsg);
}

// Merge top-level fields with SP's variables[N][name]/[value] pairs
function flattenVariables(payload) {
  const result = { ...payload };

  // SP sends: variables[0][name]=email, variables[0][value]=foo@bar.com, ...
  const varMap = {};
  for (const [key, val] of Object.entries(payload)) {
    const m = key.match(/^variables\[(\d+)\]\[(name|value)\]$/);
    if (!m) continue;
    const idx  = m[1];
    const prop = m[2];
    varMap[idx] = varMap[idx] || {};
    varMap[idx][prop] = val;
    delete result[key];
  }

  for (const v of Object.values(varMap)) {
    if (v.name && v.value !== undefined && v.value !== '') result[v.name] = v.value;
  }

  return result;
}

// GET /webhook/:token/test — fires a synthetic test lead (called from the app UI)
router.get('/webhook/:token/test', async (req, res) => {
  const { token } = req.params;
  const spUserId  = req.cookies?.sp_user_id;

  const config = db.prepare(`
    SELECT sc.slack_webhook_url, sc.channel_name, u.sp_user_id
    FROM   slack_configs sc
    JOIN   users u ON u.id = sc.user_id
    WHERE  sc.webhook_token = ? AND u.sp_user_id = ?
  `).get(token, spUserId);

  if (!config) return res.status(404).json({ error: 'Config not found' });

  const testPayload = {
    name:       'Test Lead',
    email:      'test@example.com',
    phone:      '+1 555 000 0000',
    popup_name: 'My Popup (test)',
  };

  try {
    await sendToSlack(config.slack_webhook_url, testPayload);
    res.json({ ok: true, channel: config.channel_name });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
