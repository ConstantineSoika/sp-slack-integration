const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db/database');

const SLACK_OAUTH_URL = 'https://slack.com/api/oauth.v2.access';

// Step 1 — redirect user to Slack OAuth consent screen
router.get('/slack/connect', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).send('Not logged in');

  const params = new URLSearchParams({
    client_id:    process.env.SLACK_CLIENT_ID,
    scope:        'incoming-webhook,channels:read',
    redirect_uri: `${process.env.BASE_URL}/slack/oauth`,
    state:        spUserId, // pass through so we can associate on callback
  });

  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
});

// Step 2 — Slack redirects here after user picks a channel
router.get('/slack/oauth', async (req, res) => {
  const { code, state: spUserId, error } = req.query;

  if (error) return res.redirect(`/app?slack_error=${encodeURIComponent(error)}`);
  if (!code || !spUserId) return res.status(400).send('Missing code or state');

  try {
    const body = new URLSearchParams({
      code,
      client_id:     process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      redirect_uri:  `${process.env.BASE_URL}/slack/oauth`,
    });

    const slackRes = await fetch(SLACK_OAUTH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    const data = await slackRes.json();

    if (!data.ok) throw new Error(data.error);

    const webhookUrl   = data.incoming_webhook?.url;
    const channelName  = data.incoming_webhook?.channel;
    const channelId    = data.incoming_webhook?.channel_id;

    if (!webhookUrl) throw new Error('No incoming webhook in Slack response');

    const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
    if (!user) return res.status(404).send('SP user not found — please reinstall');

    // Generate a unique per-user webhook token (the URL we give to SP)
    const webhookToken = uuidv4();

    db.prepare(`
      INSERT INTO slack_configs (user_id, slack_webhook_url, channel_name, channel_id, webhook_token)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET  -- one Slack config per user (replace on reconnect)
        slack_webhook_url = excluded.slack_webhook_url,
        channel_name      = excluded.channel_name,
        channel_id        = excluded.channel_id,
        webhook_token     = excluded.webhook_token,
        connected_at      = unixepoch()
    `).run(user.id, webhookUrl, channelName, channelId, webhookToken);

    res.cookie('sp_user_id', spUserId, { httpOnly: true, sameSite: 'None', secure: true, maxAge: 86400_000 });
    res.redirect('/app?slack=connected');
  } catch (err) {
    console.error('[slack] oauth error:', err.message);
    res.redirect(`/app?slack_error=${encodeURIComponent(err.message)}`);
  }
});

// DELETE /slack/disconnect — user wants to unlink Slack
router.delete('/slack/disconnect', (req, res) => {
  const spUserId = req.cookies?.sp_user_id;
  if (!spUserId) return res.status(401).json({ error: 'Not logged in' });

  const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM slack_configs WHERE user_id = ?').run(user.id);
  res.json({ ok: true });
});

module.exports = router;
