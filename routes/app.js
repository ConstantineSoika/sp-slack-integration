const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { getPopups } = require('../services/sp');

// Returns current user's connection status + Slack config — called by the iframe frontend
router.get('/api/app/status', async (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });

  const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const slack = db.prepare('SELECT channel_name, webhook_token, connected_at FROM slack_configs WHERE user_id = ?').get(user.id);

  if (!slack) {
    return res.json({ connected: false });
  }

  const webhookUrl = `${process.env.BASE_URL}/webhook/${slack.webhook_token}`;

  let popups = [];
  try { popups = await getPopups(user.id); } catch (_) {}

  res.json({
    connected:    true,
    channelName:  slack.channel_name,
    webhookUrl,
    webhookToken: slack.webhook_token,
    connectedAt:  slack.connected_at,
    popups:       popups.slice(0, 20),
  });
});

// Recent event log for this user (last 50)
router.get('/api/app/events', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });

  const rows = db.prepare(`
    SELECT lead_email, lead_name, slack_status, error_msg, received_at
    FROM   event_log
    WHERE  sp_user_id = ?
    ORDER  BY received_at DESC
    LIMIT  50
  `).all(spUserId);

  res.json(rows);
});

module.exports = router;
