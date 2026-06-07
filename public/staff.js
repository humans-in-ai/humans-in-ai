// Operator console — polls for pending human-handoff requests (no WebSocket).
// A request leaves the queue once it's claimed, answered, or times out, which
// the next poll reflects by its absence from the waiting list.
const queueEl = document.getElementById('queue');
const activeEl = document.getElementById('active');

const POLL_INTERVAL_MS = 1500;
const queue = new Map(); // requestId -> { sessionId, history, turn }
let activeRequestId = null;

async function poll() {
  let data;
  try {
    data = await (await fetch('/api/staff/pending')).json();
  } catch (e) {
    return;
  }
  const incoming = data.pending ?? [];
  const incomingIds = new Set(incoming.map((p) => p.requestId));

  let changed = false;
  let hasNew = false;

  // Drop requests that are no longer waiting (claimed/answered/expired).
  for (const rid of [...queue.keys()]) {
    if (!incomingIds.has(rid)) {
      queue.delete(rid);
      changed = true;
      if (activeRequestId === rid) {
        activeRequestId = null;
        renderActive();
      }
    }
  }
  // Add freshly-arrived requests.
  for (const p of incoming) {
    if (!queue.has(p.requestId)) {
      queue.set(p.requestId, p);
      changed = true;
      hasNew = true;
    }
  }

  if (changed) renderQueue();
  if (hasNew) flashTab();
}

function renderQueue() {
  queueEl.innerHTML = '';
  if (queue.size === 0) {
    queueEl.innerHTML =
      '<div class="queue-empty">no pending visitors<br/>waiting…</div>';
    return;
  }
  for (const [rid, req] of queue) {
    const last = [...req.history].reverse().find((h) => h.role === 'visitor');
    const item = document.createElement('div');
    item.className = `queue-item ${rid === activeRequestId ? 'active' : ''}`;
    item.innerHTML = `
      <div class="qsub">turn ${req.turn + 1} · session ${req.sessionId.slice(0, 6)}</div>
      <div class="qpreview">${escape(last ? last.text : '(no text)')}</div>
    `;
    item.addEventListener('click', () => {
      activeRequestId = rid;
      renderActive();
      renderQueue();
    });
    queueEl.appendChild(item);
  }
}

function renderActive() {
  if (!activeRequestId || !queue.has(activeRequestId)) {
    activeEl.className = 'op-status';
    activeEl.innerHTML = 'select a pending visitor on the left to respond';
    return;
  }
  const req = queue.get(activeRequestId);
  activeEl.className = '';
  activeEl.innerHTML = `
    <div class="kicker" style="margin-bottom:8px">conversation so far</div>
    <div class="op-history" id="history"></div>
    <div class="op-compose">
      <textarea id="response" placeholder="type your AI-style reply…" autofocus></textarea>
      <button class="primary" id="sendBtn">send</button>
    </div>
  `;
  const histEl = document.getElementById('history');
  for (const h of req.history) {
    const div = document.createElement('div');
    div.className = `h-item ${h.role}`;
    div.innerHTML = `<span class="who">${h.role === 'visitor' ? 'visitor' : 'previous reply'}</span>${escape(h.text)}`;
    histEl.appendChild(div);
  }
  histEl.scrollTop = histEl.scrollHeight;

  const ta = document.getElementById('response');
  ta.focus();
  const send = async () => {
    const text = ta.value.trim();
    if (!text) return;
    const rid = activeRequestId;
    ta.disabled = true;
    try {
      await fetch('/api/staff/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: rid, text }),
      });
    } catch (e) {
      /* fall through — poll will reconcile */
    }
    // Whether the response landed or was stale, the request is done for us.
    queue.delete(rid);
    if (activeRequestId === rid) activeRequestId = null;
    renderActive();
    renderQueue();
    poll();
  };
  document.getElementById('sendBtn').addEventListener('click', send);
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  });
}

function flashTab() {
  if (document.hidden) {
    const original = document.title;
    document.title = '🟠 NEW VISITOR · Spot the AI';
    setTimeout(() => (document.title = original), 3000);
  }
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

renderQueue();
renderActive();
poll();
setInterval(poll, POLL_INTERVAL_MS);
