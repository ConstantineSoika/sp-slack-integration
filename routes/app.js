const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { getPopups } = require('../services/sp');

// Returns current user's connection status + Slack config — called by the iframe frontend
router.get('/api/app/status', async (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });

  const user = db.prepare('SELECT id, theme, lang FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const slack = db.prepare('SELECT channel_name, webhook_token, connected_at FROM slack_configs WHERE user_id = ?').get(user.id);

  if (!slack) {
    return res.json({ connected: false });
  }

  const webhookUrl = `${process.env.BASE_URL}/webhook/${slack.webhook_token}`;

  // Fetch popup list from SP API, fall back to event_log discoveries
  const [spPopups, seenPopups, routedPopups] = await Promise.all([
    getPopups(user.id),
    Promise.resolve(db.prepare(`
      SELECT popup_id AS id, popup_name AS name
      FROM event_log
      WHERE sp_user_id = ? AND popup_id IS NOT NULL
      GROUP BY popup_id
      ORDER BY MAX(received_at) DESC
      LIMIT 50
    `).all(spUserId)),
    Promise.resolve(db.prepare(`
      SELECT popup_id AS id, popup_name AS name
      FROM popup_routes
      WHERE user_id = ?
    `).all(user.id)),
  ]);

  // Merge priority: SP API names > routed names > seen-only names
  const merged = new Map();
  seenPopups.forEach(p => merged.set(p.id, p));
  routedPopups.forEach(p => merged.set(p.id, p));
  spPopups.forEach(p => merged.set(p.id, p));
  const popups = Array.from(merged.values()).slice(0, 50);

  res.json({
    connected:    true,
    channelName:  slack.channel_name,
    webhookUrl,
    webhookToken: slack.webhook_token,
    connectedAt:  slack.connected_at,
    popups,
  });
});

// --- Popup routing ---

// PATCH /api/app/theme — update stored theme when SP changes it via URL param
router.patch('/api/app/theme', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });
  const { theme } = req.body;
  if (theme !== 'dark' && theme !== 'light') return res.status(400).json({ error: 'Invalid theme' });
  db.prepare('UPDATE users SET theme = ? WHERE sp_user_id = ?').run(theme, spUserId);
  res.json({ ok: true });
});

// GET /api/app/routes — list routes for this user
router.get('/api/app/routes', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  const rows = db.prepare('SELECT * FROM popup_routes WHERE user_id = ? ORDER BY created_at').all(user.id);
  res.json(rows);
});

// POST /api/app/routes — create a route
router.post('/api/app/routes', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const slack = db.prepare('SELECT slack_webhook_url, channel_name FROM slack_configs WHERE user_id = ?').get(user.id);
  if (!slack) return res.status(400).json({ error: 'Connect Slack first' });

  const { popup_id, popup_name, slack_webhook_url, channel_name } = req.body;
  if (!popup_id) return res.status(400).json({ error: 'popup_id required' });

  try {
    db.prepare(`
      INSERT INTO popup_routes (user_id, popup_id, popup_name, slack_webhook_url, channel_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, popup_id) DO UPDATE SET
        popup_name       = excluded.popup_name,
        slack_webhook_url = excluded.slack_webhook_url,
        channel_name     = excluded.channel_name,
        enabled          = 1
    `).run(user.id, popup_id, popup_name || popup_id,
      slack_webhook_url || slack.slack_webhook_url,
      channel_name      || slack.channel_name);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/app/routes/:popup_id — remove a route
router.delete('/api/app/routes/:popup_id', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  db.prepare('DELETE FROM popup_routes WHERE user_id = ? AND popup_id = ?').run(user.id, req.params.popup_id);
  res.json({ ok: true });
});

// PATCH /api/app/routes/:popup_id — toggle enabled or update channel
router.patch('/api/app/routes/:popup_id', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  const { enabled, slack_webhook_url, channel_name } = req.body;
  if (slack_webhook_url !== undefined) {
    db.prepare('UPDATE popup_routes SET slack_webhook_url = ?, channel_name = ? WHERE user_id = ? AND popup_id = ?')
      .run(slack_webhook_url, channel_name || '', user.id, req.params.popup_id);
  } else {
    db.prepare('UPDATE popup_routes SET enabled = ? WHERE user_id = ? AND popup_id = ?')
      .run(enabled ? 1 : 0, user.id, req.params.popup_id);
  }
  res.json({ ok: true });
});

// GET /api/app/channels — list all Slack channels available for routing
router.get('/api/app/channels', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const primary = db.prepare('SELECT slack_webhook_url, channel_name FROM slack_configs WHERE user_id = ?').get(user.id);
  const extras  = db.prepare('SELECT id, slack_webhook_url, channel_name FROM slack_channels WHERE user_id = ? ORDER BY connected_at').all(user.id);

  const channels = [];
  if (primary) channels.push({ id: 'primary', slack_webhook_url: primary.slack_webhook_url, channel_name: primary.channel_name, is_primary: true });
  extras.forEach(ch => channels.push({ id: ch.id, slack_webhook_url: ch.slack_webhook_url, channel_name: ch.channel_name, is_primary: false }));

  res.json(channels);
});

// DELETE /api/app/channels/:id — remove an extra channel
router.delete('/api/app/channels/:id', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  db.prepare('DELETE FROM slack_channels WHERE id = ? AND user_id = ?').run(req.params.id, user.id);
  res.json({ ok: true });
});

// Recent event log for this user (last 50)
router.get('/api/app/events', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not authenticated' });

  const rows = db.prepare(`
    SELECT popup_id, popup_name, lead_email, lead_name, slack_status, error_msg, received_at
    FROM   event_log
    WHERE  sp_user_id = ?
    ORDER  BY received_at DESC
    LIMIT  50
  `).all(spUserId);

  res.json(rows);
});

module.exports = router;
