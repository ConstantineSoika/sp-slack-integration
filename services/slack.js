// Format a SendPulse webhook payload into a Slack Block Kit message and send it
function buildBlocks(payload) {
  const name  = payload.name  || payload['variables[name]']  || null;
  const email = payload.email || payload['variables[email]'] || null;
  const phone = payload.phone || payload['variables[phone]'] || null;

  const SKIP = new Set(['name', 'email', 'phone', 'popup_id', 'popup_name', 'referrer']);

  // Collect extra custom variables — only those with non-empty values
  const extra = [];
  for (const [key, val] of Object.entries(payload)) {
    if (SKIP.has(key)) continue;
    if (key.startsWith('variables[')) continue;
    if (val === '' || val === null || val === undefined) continue;
    extra.push({ type: 'mrkdwn', text: `*${key}:*\n${val}` });
  }

  const fields = [];
  if (name)              fields.push({ type: 'mrkdwn', text: `*Name:*\n${name}` });
  if (email)             fields.push({ type: 'mrkdwn', text: `*Email:*\n${email}` });
  if (phone)             fields.push({ type: 'mrkdwn', text: `*Phone:*\n${phone}` });
  if (payload.popup_name) fields.push({ type: 'mrkdwn', text: `*Popup:*\n${payload.popup_name}` });
  if (extra.length) fields.push(...extra.slice(0, 4)); // Block Kit max 10 fields per section

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🔔 New lead from SendPulse popup', emoji: true },
    },
    {
      type: 'section',
      fields,
    },
  ];

  if (payload.referrer) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Source URL:*\n<${payload.referrer}|${payload.referrer}>` },
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `via *SP Popups × Slack* · <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|just now>`,
      },
    ],
  });

  // "Open in SP CRM" action button
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text:  { type: 'plain_text', text: 'Open SendPulse CRM', emoji: true },
        url:   'https://login.sendpulse.com/crm/contacts',
        style: 'primary',
      },
    ],
  });

  return blocks;
}

async function sendToSlack(webhookUrl, payload) {
  const blocks = buildBlocks(payload);
  const res = await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ blocks }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Slack webhook failed: ${res.status} — ${text}`);
  }
}

module.exports = { sendToSlack, buildBlocks };
