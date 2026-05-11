const socket = io();
const queueEl = document.getElementById('queue');
const activeEl = document.getElementById('active');

const queue = new Map(); // requestId -> { sessionId, history, turn }
let activeRequestId = null;

socket.emit('staff:join');

socket.on('staff:joined', ({ pending }) => {
  for (const p of pending) queue.set(p.requestId, p);
  renderQueue();
});

socket.on('staff:request-new', (req) => {
  queue.set(req.requestId, req);
  renderQueue();
  flashTab();
});

socket.on('staff:request-claimed', ({ requestId }) => {
  queue.delete(requestId);
  if (activeRequestId === requestId) {
    activeRequestId = null;
    renderActive();
  }
  renderQueue();
});

socket.on('staff:request-cancelled', ({ requestId }) => {
  queue.delete(requestId);
  if (activeRequestId === requestId) {
    activeRequestId = null;
    renderActive();
  }
  renderQueue();
});

socket.on('staff:stale', ({ requestId }) => {
  queue.delete(requestId);
  if (activeRequestId === requestId) {
    activeRequestId = null;
    renderActive();
  }
  renderQueue();
});

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
    activeEl.innerHTML =
      'select a pending visitor on the left to respond';
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
  const send = () => {
    const text = ta.value.trim();
    if (!text) return;
    socket.emit('staff:respond', { requestId: activeRequestId, text });
    ta.value = '';
    ta.disabled = true;
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
