const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { exchangeCode, fetchBearer } = require('../services/sp');

// SP App Directory calls this with ?code= when a user installs the app
// We exchange the code, store credentials, issue a session, redirect to the app UI
router.get('/login', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    // 1. Exchange install code → client_id, client_secret, sp_user_id
    const creds = await exchangeCode(code);
    const { client_id, client_secret, user_id: spUserId } = creds;

    if (!client_id || !client_secret || !spUserId) {
      return res.status(502).send('Invalid SP response');
    }

    // 2. Get initial Bearer token
    const { token: bearer, expiresAt } = await fetchBearer(client_id, client_secret);

    // 3. Upsert user record
    db.prepare(`
      INSERT INTO users (sp_user_id, client_id, client_secret, bearer_token, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sp_user_id) DO UPDATE SET
        client_id     = excluded.client_id,
        client_secret = excluded.client_secret,
        bearer_token  = excluded.bearer_token,
        expires_at    = excluded.expires_at
    `).run(spUserId, client_id, client_secret, bearer, expiresAt);

    const user = db.prepare('SELECT id FROM users WHERE sp_user_id = ?').get(spUserId);

    // 4. Redirect to frontend app with user context (signed by SP, no extra session needed —
    //    SP re-sends the Bearer with every iframe load via ?bearer= query param in some versions;
    //    here we use sp_user_id cookie to tie subsequent requests to the stored user record)
    res.cookie('sp_user_id', spUserId, { httpOnly: true, sameSite: 'None', secure: true, maxAge: 86400_000 });
    res.redirect('/app');
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(502).send('Authentication failed — please try reinstalling the app.');
  }
});

module.exports = router;
