(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  var pollTimer = null;

  // Apply theme from URL param immediately (before API call) so there's no flash
  var urlTheme = new URLSearchParams(location.search).get('theme');
  if (urlTheme) {
    document.body.classList.toggle('theme-light', urlTheme === 'light');
    // Persist to server so the DB stays in sync
    fetch('/api/app/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: urlTheme }),
    }).catch(function(){});
  }

  function applyTheme(theme) {
    document.body.classList.toggle('theme-light', theme === 'light');
    $('theme-toggle').textContent = theme === 'light' ? '☾' : '☀';
  }

  $('theme-toggle').addEventListener('click', function () {
    var next = document.body.classList.contains('theme-light') ? 'dark' : 'light';
    applyTheme(next);
    fetch('/api/app/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    }).catch(function(){});
  });

  function showFlash(msg, type) {
    const el = document.createElement('div');
    el.className = 'flash ' + type;
    el.textContent = msg;
    $('flash-area').appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function setSection(name) {
    ['connect', 'connected', 'loading'].forEach(s => {
      $('section-' + s).style.display = s === name ? '' : 'none';
    });
  }

  function fmtDate(unix) {
    if (!unix) return '';
    return new Date(unix * 1000).toLocaleString();
  }

  // Accordions
  var settingsOpen = false;
  $('settings-hd').addEventListener('click', function () {
    settingsOpen = !settingsOpen;
    $('settings-hd').classList.toggle('open', settingsOpen);
    $('settings-bd').classList.toggle('open', settingsOpen);
  });

  var leadsOpen = false;
  $('leads-hd').addEventListener('click', function () {
    leadsOpen = !leadsOpen;
    $('leads-hd').classList.toggle('open', leadsOpen);
    $('leads-bd').classList.toggle('open', leadsOpen);
  });

  var currentStatus = null;
  var currentRoutes = [];

  // --- Poll for status change after user opens Slack OAuth tab ---
  $('connect-btn').addEventListener('click', function () {
    startPolling();
  });

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async function () {
      try {
        const res  = await fetch('/api/app/status');
        const data = await res.json();
        if (data.connected) {
          stopPolling();
          showFlash('Slack connected! Copy your webhook URL below.', 'success');
          renderConnected(data);
        }
      } catch (_) {}
    }, 2000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // --- Load initial status ---
  async function loadStatus() {
    setSection('loading');
    try {
      const res  = await fetch('/api/app/status');
      const data = await res.json();
      if (!data.connected) {
        $('status-badge').textContent = 'Not connected';
        $('status-badge').className   = 'badge badge-disconnected';
        setSection('connect');
        return;
      }
      renderConnected(data);
    } catch (e) {
      showFlash('Could not load status — please refresh.', 'error');
      setSection('connect');
    }
  }

  function renderConnected(data) {
    stopPolling();
    currentStatus = data;
    applyTheme(data.theme || 'dark');

    $('status-badge').textContent = '# ' + data.channelName;
    $('status-badge').className   = 'badge badge-connected';
    $('channel-line').textContent = 'Posting to #' + data.channelName + ' · connected ' + fmtDate(data.connectedAt);
    $('webhook-url-text').textContent = data.webhookUrl;
    $('copy-btn').dataset.url         = data.webhookUrl;
    $('test-btn').dataset.token       = data.webhookToken;

    setSection('connected');
    loadRouting();
    loadEvents();
  }

  var currentChannels = [];

  // --- Routing ---
  async function loadRouting() {
    var routesRes   = await fetch('/api/app/routes');
    currentRoutes   = routesRes.ok ? await routesRes.json() : [];
    var chRes       = await fetch('/api/app/channels');
    currentChannels = chRes.ok ? await chRes.json() : [];
    // Also fetch popups discovered from event_log
    var statusRes   = await fetch('/api/app/status');
    var statusData  = statusRes.ok ? await statusRes.json() : {};
    renderRouting(statusData.popups || []);
    renderChannelsArea();
  }

  function buildChannelSelect(currentWebhook, popupId) {
    var sel = document.createElement('select');
    sel.className = 'channel-select';
    currentChannels.forEach(function (ch) {
      var opt = document.createElement('option');
      opt.value = ch.slack_webhook_url;
      opt.textContent = '#' + ch.channel_name + (ch.is_primary ? ' (default)' : '');
      opt.selected = ch.slack_webhook_url === currentWebhook;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      var chosen = currentChannels.find(function(ch) { return ch.slack_webhook_url === sel.value; });
      if (chosen) updateRouteChannel(popupId, chosen.slack_webhook_url, chosen.channel_name);
    });
    return sel;
  }

  function renderRouting(knownPopups) {
    knownPopups = knownPopups || [];
    var routes = currentRoutes;
    var activeCount = routes.filter(function (r) { return r.enabled; }).length;
    var note = $('routing-note');

    if (routes.length === 0) {
      note.textContent = 'Forwarding all leads — add popup routes below to filter by popup';
      note.className = 'route-status-note all';
    } else {
      note.textContent = activeCount + ' popup' + (activeCount !== 1 ? 's' : '') + ' active — others are ignored';
      note.className = 'route-status-note sel';
    }

    var list = $('routing-list');
    list.innerHTML = '';

    routes.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'route-row';

      var nameSpan = document.createElement('span');
      nameSpan.className   = 'route-name';
      nameSpan.textContent = r.popup_name || r.popup_id;

      var delBtn = document.createElement('button');
      delBtn.className   = 'btn btn-danger btn-sm';
      delBtn.textContent = '✕';
      delBtn.title       = 'Remove';
      delBtn.addEventListener('click', function () {
        deleteRoute(r.popup_id);
      });

      var uid = 'toggle-' + r.popup_id.replace(/[^a-z0-9]/gi, '_');
      var label = document.createElement('label');
      label.className = 'toggle';

      var chk = document.createElement('input');
      chk.type    = 'checkbox';
      chk.id      = uid;
      chk.checked = !!r.enabled;
      chk.addEventListener('change', function () {
        toggleRoute(r.popup_id, chk.checked);
      });

      var track = document.createElement('span');
      track.className = 'toggle-track';

      label.appendChild(chk);
      label.appendChild(track);

      row.appendChild(nameSpan);
      if (currentChannels.length > 1) {
        row.appendChild(buildChannelSelect(r.slack_webhook_url, r.popup_id));
      }
      row.appendChild(delBtn);
      row.appendChild(label);
      list.appendChild(row);
    });

    // Discovered popup IDs from event_log that aren't yet in routes
    var routedIds = new Set(routes.map(function(r) { return r.popup_id; }));
    var unrouted  = knownPopups.filter(function(p) { return p.id && !routedIds.has(p.id); });

    if (unrouted.length) {
      var discHd = document.createElement('p');
      discHd.style.cssText = 'font-size:11px;color:var(--muted);margin-top:14px;margin-bottom:6px';
      discHd.textContent = 'Seen in recent leads — click to add:';
      list.appendChild(discHd);

      unrouted.forEach(function(p) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)';

        var nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'flex:1;font-size:12px;color:var(--muted);font-family:monospace';
        nameSpan.textContent = p.id;

        var addBtn = document.createElement('button');
        addBtn.className   = 'btn btn-ghost btn-sm';
        addBtn.textContent = '+ Add';
        addBtn.addEventListener('click', function() { addRoute(p.id, p.name); });

        row.appendChild(nameSpan);
        row.appendChild(addBtn);
        list.appendChild(row);
      });
    } else if (!routes.length) {
      var hint = document.createElement('p');
      hint.className = 'empty mt8';
      hint.style.fontSize = '11px';
      hint.textContent = 'Popup IDs will appear here after the first lead arrives. Until then, all leads forward to Slack.';
      list.appendChild(hint);
    }
  }

  async function updateRouteChannel(popupId, webhookUrl, channelName) {
    await fetch('/api/app/routes/' + encodeURIComponent(popupId), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slack_webhook_url: webhookUrl, channel_name: channelName }),
    });
    await loadRouting();
  }

  function renderChannelsArea() {
    var area = $('channels-area');
    if (!area) return;
    area.innerHTML = '';

    // List extra channels with remove button
    var extras = currentChannels.filter(function(ch) { return !ch.is_primary; });
    if (extras.length) {
      var hd = document.createElement('p');
      hd.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:6px';
      hd.textContent = 'Connected channels:';
      area.appendChild(hd);
      extras.forEach(function(ch) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px';
        var name = document.createElement('span');
        name.style.cssText = 'flex:1;font-size:12px;color:var(--text)';
        name.textContent = '#' + ch.channel_name;
        var rm = document.createElement('button');
        rm.className = 'btn btn-danger btn-sm';
        rm.textContent = '✕';
        rm.addEventListener('click', function() {
          fetch('/api/app/channels/' + ch.id, { method: 'DELETE' }).then(function() { loadRouting(); });
        });
        row.appendChild(name);
        row.appendChild(rm);
        area.appendChild(row);
      });
    }

    // "Connect another channel" button
    var addBtn = document.createElement('a');
    addBtn.href   = '/slack/connect?mode=channel';
    addBtn.target = '_blank';
    addBtn.className = 'btn btn-ghost btn-sm mt8';
    addBtn.style.display = 'inline-flex';
    addBtn.textContent = '+ Connect another channel';
    addBtn.addEventListener('click', function() {
      // Poll for a new channel appearing
      var before = currentChannels.length;
      var t = setInterval(async function() {
        var res = await fetch('/api/app/channels');
        if (!res.ok) return;
        var ch = await res.json();
        if (ch.length > before) { clearInterval(t); loadRouting(); }
      }, 2000);
      setTimeout(function() { clearInterval(t); }, 120000);
    });
    area.appendChild(addBtn);
  }

  async function addRoute(popupId, popupLabel) {
    await fetch('/api/app/routes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ popup_id: popupId, popup_name: popupLabel || popupId }),
    });
    await loadRouting();
  }

  async function deleteRoute(popupId) {
    await fetch('/api/app/routes/' + encodeURIComponent(popupId), { method: 'DELETE' });
    await loadRouting();
  }

  async function toggleRoute(popupId, enabled) {
    await fetch('/api/app/routes/' + encodeURIComponent(popupId), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await loadRouting();
  }

  // --- Events ---
  async function loadEvents() {
    try {
      const res  = await fetch('/api/app/events');
      const rows = await res.json();
      const area = $('events-area');

      if (!rows.length) {
        area.innerHTML = '<p class="empty">No leads yet — send a test or wait for the first submission.</p>';
        return;
      }

      const tbl = document.createElement('table');
      tbl.className = 'event-table';
      tbl.innerHTML = '<thead><tr><th>Popup</th><th>Email</th><th>Name</th><th>Status</th><th>Received</th></tr></thead><tbody></tbody>';
      const tbody = tbl.querySelector('tbody');

      rows.forEach(function (r) {
        const tr = document.createElement('tr');
        var statusClass = r.slack_status === 'ok' ? 'status-ok' : r.slack_status === 'dropped' ? 'status-dropped' : 'status-error';
        var statusLabel = r.slack_status === 'ok' ? '✓ Sent' : r.slack_status === 'dropped' ? '— Dropped' : '✗ Error';
        tr.innerHTML =
          '<td>' + (r.popup_name || r.popup_id || '—') + '</td>' +
          '<td>' + (r.lead_email || '—') + '</td>' +
          '<td>' + (r.lead_name  || '—') + '</td>' +
          '<td class="' + statusClass + '">' + statusLabel + '</td>' +
          '<td>' + fmtDate(r.received_at) + '</td>';
        tbody.appendChild(tr);
      });

      area.innerHTML = '';
      area.appendChild(tbl);
    } catch (_) {}
  }

  // --- Copy button ---
  document.addEventListener('click', async function (e) {
    if (!e.target.closest('#copy-btn')) return;
    const btn = $('copy-btn');
    const url = btn.dataset.url;
    try { await navigator.clipboard.writeText(url); }
    catch (_) {
      var ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });

  // --- Test button ---
  document.addEventListener('click', async function (e) {
    if (!e.target.closest('#test-btn')) return;
    const btn = $('test-btn'), token = btn.dataset.token;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch('/webhook/' + token + '/test');
      const data = await res.json();
      if (data.ok) { showFlash('Test lead sent to #' + data.channel + '!', 'success'); loadEvents(); }
      else { showFlash('Failed: ' + data.error, 'error'); }
    } catch (_) { showFlash('Network error — please try again.', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Send test lead'; }
  });

  // --- Disconnect button ---
  document.addEventListener('click', async function (e) {
    if (!e.target.closest('#disconnect-btn')) return;
    if (!confirm('Disconnect Slack? Your webhook URL will stop working.')) return;
    await fetch('/slack/disconnect', { method: 'DELETE' });
    stopPolling();
    loadStatus();
  });

  // URL param fallback
  var params = new URLSearchParams(location.search);
  if (params.get('slack') === 'connected') {
    history.replaceState({}, '', '/app');
    showFlash('Slack connected! Copy your webhook URL below.', 'success');
  } else if (params.get('slack_error')) {
    history.replaceState({}, '', '/app');
    showFlash('Slack error: ' + params.get('slack_error'), 'error');
  }

  loadStatus();
})();
