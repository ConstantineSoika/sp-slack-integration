const db = require('../db/database');

const SP_API = 'https://api.sendpulse.com';
const SP_MARKET = 'https://api.sendpulse.com/market-service';

// Exchange SP install code for client_id + client_secret
async function exchangeCode(code) {
  const body = new URLSearchParams({
    app_id:  process.env.SP_APP_ID,
    secret:  process.env.SP_APP_SECRET,
    code,
  });

  const res = await fetch(`${SP_MARKET}/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`SP authorize failed: ${res.status}`);
  return res.json(); // { client_id, client_secret, user_id }
}

// Get a Bearer token using client credentials
async function fetchBearer(clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${SP_API}/oauth/access_token/market`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`SP token fetch failed: ${res.status}`);
  const data = await res.json();
  // data: { access_token, expires_in, token_type }
  return {
    token:     data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in || 7200) - 60,
  };
}

// Return a valid Bearer token for a user, refreshing if needed
async function getBearerForUser(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('User not found');

  if (user.bearer_token && user.expires_at > Math.floor(Date.now() / 1000)) {
    return user.bearer_token;
  }

  const { token, expiresAt } = await fetchBearer(user.client_id, user.client_secret);
  db.prepare('UPDATE users SET bearer_token = ?, expires_at = ? WHERE id = ?')
    .run(token, expiresAt, userId);
  return token;
}

// Fetch the user's popups list (read-only scope)
async function getPopups(userId) {
  const token = await getBearerForUser(userId);
  const res = await fetch(`${SP_API}/pop_ups`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

module.exports = { exchangeCode, fetchBearer, getBearerForUser, getPopups };
