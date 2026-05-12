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
  const json = await res.json();
  const d = json.data ?? json;
  return { client_id: d.client_id, client_secret: d.client_secret, user_id: String(Math.floor(Number(d.user_id))) };
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

// Fetch all popups for a user — returns [{ id, name }] or []
async function getPopups(userId) {
  try {
    const token = await getBearerForUser(userId);
    const res = await fetch(`${SP_API}/v2/pop-ups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('[sp] GET /v2/pop-ups status:', res.status);
    if (!res.ok) { console.log('[sp] body:', await res.text()); return []; }
    const data = await res.json();
    const items = data.data ?? data ?? [];
    return items.map(p => ({ id: String(p.id), name: p.name || p.title || String(p.id) }));
  } catch (e) {
    console.error('[sp] getPopups error:', e.message);
    return [];
  }
}

// Fetch a single popup by ID — returns { id, name } or null
async function getPopupById(userId, popupId) {
  try {
    const token = await getBearerForUser(userId);
    const res = await fetch(`${SP_API}/v2/pop-ups/${encodeURIComponent(popupId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('[sp] GET /v2/pop-ups/' + popupId + ' status:', res.status);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data.data ?? data;
    if (!d || (!d.name && !d.title)) return null;
    return { id: String(d.id || popupId), name: d.name || d.title };
  } catch (e) {
    console.error('[sp] getPopupById error:', e.message);
    return null;
  }
}

module.exports = { exchangeCode, fetchBearer, getBearerForUser, getPopups, getPopupById };
