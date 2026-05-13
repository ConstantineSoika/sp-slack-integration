const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { exchangeCode, fetchBearer } = require('../services/sp');

// SP App Directory calls this with ?code= when a user installs the app
// We exchange the code, store credentials, issue a session, redirect to the app UI
async function handleLogin(req, res) {
  const code  = req.query.code  || req.body?.code;
  const theme = req.body?.theme || req.query.theme || 'dark';
  const lang  = req.body?.lang  || req.query.lang  || 'en';
  console.log('[login] theme:', theme, 'lang:', lang, 'query:', JSON.stringify(req.query));
  if (!code) return res.status(400).send('Missing code');

  try {
    const creds = await exchangeCode(code);
    console.log('[login] SP exchangeCode response:', JSON.stringify(creds));
    const { client_id, client_secret, user_id: spUserId } = creds;

    if (!client_id || !client_secret || !spUserId) {
      return res.status(502).send(`Invalid SP response: ${JSON.stringify(creds)}`);
    }

    const { token: bearer, expiresAt } = await fetchBearer(client_id, client_secret);
    console.log('[login] fetchBearer ok, expiresAt:', expiresAt);

    db.prepare(`
      INSERT INTO users (sp_user_id, client_id, client_secret, bearer_token, expires_at, theme, lang)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sp_user_id) DO UPDATE SET
        client_id     = excluded.client_id,
        client_secret = excluded.client_secret,
        bearer_token  = excluded.bearer_token,
        expires_at    = excluded.expires_at,
        theme         = excluded.theme,
        lang          = excluded.lang
    `).run(spUserId, client_id, client_secret, bearer, expiresAt, theme, lang);

    res.cookie('sp_user_id', spUserId, { httpOnly: true, sameSite: 'None', secure: true, maxAge: 86400_000 });
    res.redirect('/app');
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(502).send('Authentication failed — please try reinstalling the app.');
  }
}

router.get('/login', handleLogin);
router.post('/login', handleLogin);
router.post('/', handleLogin);

module.exports = router;
