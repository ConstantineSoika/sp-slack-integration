const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// SP calls this when user uninstalls the app — GDPR-friendly: wipe all user data
router.post('/uninstall', express.urlencoded({ extended: true }), (req, res) => {
  const spUserId = req.body?.user_id || req.query?.user_id;

  if (!spUserId) {
    console.warn('[uninstall] called without user_id');
    return res.sendStatus(200); // always 200 to SP
  }

  try {
    // CASCADE deletes slack_configs automatically
    db.prepare('DELETE FROM users WHERE sp_user_id = ?').run(spUserId);
    console.log('[uninstall] deleted user:', spUserId);
  } catch (err) {
    console.error('[uninstall] error:', err.message);
  }

  res.sendStatus(200);
});

module.exports = router;
