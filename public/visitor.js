const socket = io();

const screens = {
  start: document.getElementById('start'),
  shape: document.getElementById('shape'),
  forming: document.getElementById('forming'),
  chat: document.getElementById('chat'),
  wisdom: document.getElementById('wisdom'),
  reveal: document.getElementById('reveal'),
};

// Soul-tint hex per tone (drives chat UI accents — bubbles, dots, soul card)
const TONE_TINT = {
  honest: '#4f9dff',
  kind: '#ff7a59',
};

const state = {
  sessionId: null,
  totalTurns: 3,
  turn: 0,
  soul: null,
  shapeChoices: { tone: null, priority: null, struggle: null },
  wisdomText: '',
  wisdomNumber: null,
};

function showScreen(name) {
  for (const k of Object.keys(screens)) {
    screens[k].classList.toggle('active', k === name);
  }
}

// =====================================================
// START
// =====================================================
document.getElementById('startBtn').addEventListener('click', () => {
  socket.emit('visitor:start');
});

document.getElementById('restartBtn').addEventListener('click', () => {
  window.location.reload();
});

socket.on('visitor:started', ({ sessionId, totalTurns }) => {
  state.sessionId = sessionId;
  state.totalTurns = totalTurns;
  showScreen('shape');
});

// =====================================================
// SHAPE
// =====================================================
document.querySelectorAll('.choice-row').forEach((row) => {
  const trait = row.dataset.trait;
  row.querySelectorAll('button.choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      row
        .querySelectorAll('button.choice')
        .forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.shapeChoices[trait] = btn.dataset.value;
      const all = Object.values(state.shapeChoices).every((v) => v != null);
      document.getElementById('shapeNext').disabled = !all;
    });
  });
});

document.getElementById('shapeNext').addEventListener('click', () => {
  const btn = document.getElementById('shapeNext');
  btn.disabled = true;
  btn.textContent = 'bringing your AI to life…';
  socket.emit('visitor:shape', {
    sessionId: state.sessionId,
    values: state.shapeChoices,
  });
  // Show the soul-forming animation immediately while we wait for the server.
  showFormingScreen();
});

function showFormingScreen() {
  const stage = document.getElementById('formTraits');
  stage.innerHTML = '';
  const order = ['tone', 'priority', 'struggle'];
  // We don't have the icon/label dictionary on the client yet — derive from
  // the choice value the user picked. Match the server-side TRAIT_LABELS.
  const traits = {
    tone: { honest: { icon: '🪞', label: 'Honest' }, kind: { icon: '🤲', label: 'Kind' } },
    priority: {
      efficiency: { icon: '⚡', label: 'Efficiency' },
      connection: { icon: '🌊', label: 'Connection' },
    },
    struggle: {
      solve: { icon: '🛠️', label: 'Action' },
      sit: { icon: '🫂', label: 'Presence' },
    },
  };
  for (const dim of order) {
    const v = state.shapeChoices[dim];
    if (!v) continue;
    const t = traits[dim][v];
    const chip = document.createElement('span');
    chip.className = 'trait-chip form-chip';
    chip.innerHTML = `<span class="trait-icon">${t.icon}</span><span>${t.label}</span>`;
    stage.appendChild(chip);
  }
  showScreen('forming');
}

socket.on('visitor:shaped', ({ soul }) => {
  state.soul = soul;
  applySoulTint();
  renderSoulCard(soul);
  setProgress(`round 1 / ${state.totalTurns}`);
  // Hold the forming screen for a beat so the moment lands, then reveal chat.
  setTimeout(() => showScreen('chat'), 1200);
});

function applySoulTint() {
  const tint = TONE_TINT[state.shapeChoices.tone] ?? '#ff7a59';
  document.body.style.setProperty('--soul-tint', tint);
  document.body.dataset.soulTone = state.shapeChoices.tone ?? '';
}

function renderSoulCard(soul) {
  const wrap = document.querySelector('#soulCard .soul-traits');
  const reveal = document.getElementById('revealSoul');
  const html = ['tone', 'priority', 'struggle']
    .map(
      (k) =>
        `<span class="trait-chip"><span class="trait-icon">${escape(soul[k].icon)}</span><span>${escape(soul[k].label)}</span></span>`
    )
    .join('');
  wrap.innerHTML = html;
  reveal.innerHTML = html;
}

// =====================================================
// CHAT
// =====================================================
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const composerEl = document.getElementById('composer');
const progressEl = document.getElementById('progress');
const toWisdomBtn = document.getElementById('toWisdom');
const sendBtn = document.getElementById('sendBtn');

function setProgress(s) {
  progressEl.textContent = s;
}

function addBubble({ role, text, isMirror = false }) {
  const wrap = document.createElement('div');
  wrap.className = `bubble ${role === 'visitor' ? 'visitor' : 'partner'}`;
  if (isMirror) {
    wrap.classList.add('mirror');
    const tag = document.createElement('div');
    tag.className = 'mirror-tag';
    tag.textContent = '✦  the mirror';
    wrap.appendChild(tag);
  }
  const txt = document.createElement('div');
  txt.className = 'bubble-text';
  txt.textContent = text;
  wrap.appendChild(txt);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'bubble partner typing';
  wrap.id = 'typing';
  wrap.innerHTML =
    '<div class="bubble-text"><span></span><span></span><span></span></div>';
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById('typing');
  if (t) t.remove();
}

function enableInput() {
  inputEl.disabled = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

function disableInput() {
  inputEl.disabled = true;
  sendBtn.disabled = true;
}

composerEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  if (state.turn >= state.totalTurns) return;
  addBubble({ role: 'visitor', text });
  socket.emit('visitor:message', { sessionId: state.sessionId, text });
  inputEl.value = '';
  disableInput();
});

socket.on('visitor:thinking', () => {
  addTyping();
});

socket.on('visitor:reply', ({ text, turn, remaining, isMirror }) => {
  removeTyping();
  addBubble({ role: 'ai', text, isMirror: !!isMirror });
  state.turn = turn;
  if (remaining === 0 || turn >= state.totalTurns) {
    setProgress('the mirror moment.');
    disableInput();
    toWisdomBtn.classList.remove('hidden');
    return;
  }
  if (turn === 0) {
    // opening — visitor hasn't spoken yet, this is round 1 incoming
    setProgress(`round 1 / ${state.totalTurns}`);
  } else {
    setProgress(`round ${turn + 1} / ${state.totalTurns}`);
  }
  enableInput();
});

toWisdomBtn.addEventListener('click', () => {
  showScreen('wisdom');
  document.getElementById('wisdomInput').focus();
});

// =====================================================
// WISDOM
// =====================================================
const wisdomInput = document.getElementById('wisdomInput');
const wisdomSubmit = document.getElementById('wisdomSubmit');
const wisdomCount = document.getElementById('wisdomCount');

wisdomInput.addEventListener('input', () => {
  const len = wisdomInput.value.trim().length;
  wisdomCount.textContent = `${len} / 240`;
  wisdomSubmit.disabled = len < 3;
});

wisdomSubmit.addEventListener('click', () => {
  const text = wisdomInput.value.trim();
  if (text.length < 3) return;
  state.wisdomText = text;
  wisdomSubmit.disabled = true;
  wisdomSubmit.textContent = 'adding your voice…';
  socket.emit('visitor:wisdom', { sessionId: state.sessionId, text });
});

socket.on('visitor:wisdom-saved', ({ wisdomNumber, text }) => {
  state.wisdomNumber = wisdomNumber;
  document.getElementById('revealWisdomLabel').textContent =
    `YOUR WISDOM · #${wisdomNumber} ON THE WALL`;
  document.getElementById('revealWisdom').textContent = `“${text}”`;
  fetchAndRenderBoothStat();
  showScreen('reveal');
});

// =====================================================
// BOOTH STATS (foot of reveal screen)
// =====================================================
async function fetchAndRenderBoothStat() {
  try {
    const r = await fetch('/api/booth-stats');
    const s = await r.json();
    if (s.wisdomToday > 0) {
      document.getElementById('boothStat').textContent =
        `today at the booth · ${s.sessions} souls shaped · ${s.wisdomToday} pieces of wisdom on the wall`;
    }
  } catch (e) {
    /* ignore */
  }
}

// =====================================================
// utils
// =====================================================
function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
