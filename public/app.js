(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  function showFlash(msg, type) {
    const el = document.createElement('div');
    el.className = `flash ${type}`;
    el.textContent = msg;
    $('flash-area').appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function setSection(name) {
    ['connect', 'connected', 'loading'].forEach(s => {
      $(`section-${s}`).style.display = s === name ? '' : 'none';
    });
  }

  function fmtDate(unix) {
    if (!unix) return '';
    return new Date(unix * 1000).toLocaleString();
  }

  async function loadStatus() {
    setSection('loading');
    try {
      const res  = await fetch('/api/app/status');
      const data = await res.json();

      if (!data.connected) {
        $('status-badge').textContent = 'Not connected';
        $('status-badge').className   = 'badge disconnected';
        setSection('connect');
        return;
      }

      // Connected
      $('status-badge').textContent = `# ${data.channelName}`;
      $('status-badge').className   = 'badge connected';
      $('channel-line').textContent =
        `Posting to #${data.channelName} · connected ${fmtDate(data.connectedAt)}`;
      $('webhook-url-text').textContent = data.webhookUrl;
      $('copy-btn').dataset.url         = data.webhookUrl;
      $('test-btn').dataset.token       = data.webhookToken;

      // Popups list
      if (data.popups && data.popups.length) {
        const list = $('popups-list');
        list.innerHTML = '';
        data.popups.forEach(p => {
          const li = document.createElement('li');
          li.textContent = p.name || p.id;
          list.appendChild(li);
        });
        $('popups-card').style.display = '';
      }

      setSection('connected');
      loadEvents();
    } catch (e) {
      showFlash('Could not load status — please refresh.', 'error');
      setSection('connect');
    }
  }

  async function loadEvents() {
    try {
      const res  = await fetch('/api/app/events');
      const rows = await res.json();
      if (!rows.length) return;

      const area = $('events-area');
      const tbl  = document.createElement('table');
      tbl.className = 'event-table';
      tbl.innerHTML = `
        <thead><tr>
          <th>Email</th><th>Name</th><th>Status</th><th>Received</th>
        </tr></thead>
        <tbody></tbody>`;

      const tbody = tbl.querySelector('tbody');
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.lead_email || '—'}</td>
          <td>${r.lead_name  || '—'}</td>
          <td class="status-${r.slack_status}">${r.slack_status === 'ok' ? '✓ Sent' : '✗ Error'}</td>
          <td>${fmtDate(r.received_at)}</td>`;
        tbody.appendChild(tr);
      });

      area.innerHTML = '';
      area.appendChild(tbl);
    } catch (_) {}
  }

  // Copy button
  document.addEventListener('click', async e => {
    if (!e.target.closest('#copy-btn')) return;
    const btn = $('copy-btn');
    const url = btn.dataset.url;
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent  = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    } catch (_) {
      // Fallback for SP iframe (clipboard may be blocked)
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    }
  });

  // Test button
  document.addEventListener('click', async e => {
    if (!e.target.closest('#test-btn')) return;
    const btn   = $('test-btn');
    const token = btn.dataset.token;
    btn.disabled    = true;
    btn.textContent = 'Sending…';
    try {
      const res  = await fetch(`/webhook/${token}/test`);
      const data = await res.json();
      if (data.ok) {
        showFlash(`Test lead sent to #${data.channel}!`, 'success');
        loadEvents();
      } else {
        showFlash(`Failed: ${data.error}`, 'error');
      }
    } catch (_) {
      showFlash('Network error — please try again.', 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Send test lead →';
    }
  });

  // Disconnect button
  document.addEventListener('click', async e => {
    if (!e.target.closest('#disconnect-btn')) return;
    if (!confirm('Disconnect Slack? Your webhook URL will stop working.')) return;
    await fetch('/slack/disconnect', { method: 'DELETE' });
    loadStatus();
  });

  // Check URL params for Slack callback result
  const params = new URLSearchParams(location.search);
  if (params.get('slack') === 'connected') {
    history.replaceState({}, '', '/app');
    showFlash('Slack connected! Copy your webhook URL below.', 'success');
  } else if (params.get('slack_error')) {
    history.replaceState({}, '', '/app');
    showFlash(`Slack error: ${params.get('slack_error')}`, 'error');
  }

  loadStatus();
})();
