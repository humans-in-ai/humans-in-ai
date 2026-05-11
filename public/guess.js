const socket = io();

const screens = {
  start: document.getElementById('start'),
  chat: document.getElementById('chat'),
  reveal: document.getElementById('reveal'),
};
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const composerEl = document.getElementById('composer');
const progressEl = document.getElementById('progress');

const state = {
  sessionId: null,
  totalTurns: 6,
  turn: 0,
  awaitingGuess: false,
};

function showScreen(name) {
  for (const k of Object.keys(screens)) {
    screens[k].classList.toggle('active', k === name);
  }
}

function setProgress(round, total) {
  progressEl.textContent = `round ${Math.min(round, total)} / ${total}`;
}

function addBubble({ role, text, id }) {
  const wrap = document.createElement('div');
  wrap.className = `bubble ${role}`;
  if (id) wrap.dataset.messageId = id;
  const txt = document.createElement('div');
  txt.className = 'bubble-text';
  txt.textContent = text;
  wrap.appendChild(txt);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
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

function attachGuess(bubble, messageId) {
  const row = document.createElement('div');
  row.className = 'guess-row';
  row.innerHTML = `
    <span class="guess-prompt">who sent that?</span>
    <button class="guess" data-guess="human">👤 human</button>
    <button class="guess" data-guess="ai">🤖 AI</button>
  `;
  bubble.appendChild(row);
  row.querySelectorAll('button.guess').forEach((b) =>
    b.addEventListener('click', () => {
      socket.emit('guess:guess', {
        sessionId: state.sessionId,
        messageId,
        guess: b.dataset.guess,
      });
      row.querySelectorAll('button.guess').forEach((x) => (x.disabled = true));
      state.awaitingGuess = false;
    })
  );
}

function renderGuessResult(bubble, { guess, truth, correct }) {
  const row = bubble.querySelector('.guess-row');
  if (!row) return;
  row.classList.add(correct ? 'correct' : 'wrong');
  row.innerHTML = `
    <span class="result-icon">${correct ? '✓' : '✗'}</span>
    <span>you said <b>${guess === 'ai' ? '🤖 AI' : '👤 human'}</b></span>
    <span class="sep">·</span>
    <span>actually <b>${truth === 'ai' ? '🤖 AI' : '👤 human'}</b></span>
  `;
  inputEl.disabled = false;
  inputEl.focus();
}

document.getElementById('startBtn').addEventListener('click', () => {
  socket.emit('guess:start');
});

document.getElementById('restartBtn').addEventListener('click', () => {
  window.location.reload();
});

composerEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || state.awaitingGuess) return;
  if (state.turn >= state.totalTurns) return;
  addBubble({ role: 'visitor', text });
  socket.emit('guess:message', { sessionId: state.sessionId, text });
  inputEl.value = '';
  inputEl.disabled = true;
});

socket.on('guess:started', ({ sessionId, totalTurns }) => {
  state.sessionId = sessionId;
  state.totalTurns = totalTurns;
  state.turn = 0;
  setProgress(1, totalTurns);
  showScreen('chat');
  inputEl.focus();
});

socket.on('guess:thinking', () => addTyping());

socket.on('guess:reply', ({ messageId, text, remaining }) => {
  removeTyping();
  const bubble = addBubble({ role: 'partner', text, id: messageId });
  state.awaitingGuess = true;
  attachGuess(bubble, messageId);
  state.turn += 1;
  setProgress(state.turn + 1, state.totalTurns);
  if (remaining === 0) progressEl.textContent = 'final reveal coming…';
});

socket.on('guess:guess-result', (payload) => {
  const bubble = messagesEl.querySelector(
    `.bubble.partner[data-message-id="${payload.messageId}"]`
  );
  if (bubble) renderGuessResult(bubble, payload);
});

socket.on('guess:reveal', ({ transcript, stats, booth }) => {
  setTimeout(() => renderReveal({ transcript, stats, booth }), 600);
});

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderReveal({ transcript, stats, booth }) {
  document.getElementById('aiFool').textContent = pct(stats.aiFooledRate);
  document.getElementById('humanFool').textContent = pct(stats.humanFooledRate);
  document.getElementById('accuracy').textContent = pct(stats.accuracy);

  const tEl = document.getElementById('revealTranscript');
  tEl.innerHTML = '';
  const grouped = [];
  for (const m of transcript) {
    if (m.role === 'visitor') grouped.push({ visitor: m });
    else {
      const last = grouped[grouped.length - 1];
      if (last && !last.partner) last.partner = m;
      else grouped.push({ partner: m });
    }
  }
  for (const turn of grouped) {
    const block = document.createElement('div');
    block.className = 'turn-block';
    if (turn.visitor) {
      const v = document.createElement('div');
      v.className = 'tline you';
      v.innerHTML = `<span class="tag">you</span> ${escape(turn.visitor.text)}`;
      block.appendChild(v);
    }
    if (turn.partner) {
      const p = document.createElement('div');
      const correct = turn.partner.correct === 1;
      const guessed = turn.partner.guess;
      const truth = turn.partner.source;
      p.className = `tline partner truth-${truth} ${
        guessed ? (correct ? 'correct' : 'wrong') : ''
      }`;
      p.innerHTML = `
        <span class="tag">${truth === 'ai' ? '🤖 AI' : '👤 human-as-AI'}</span>
        ${escape(turn.partner.text)}
        ${
          guessed
            ? `<span class="meta">${correct ? '✓ you guessed right' : `✗ you guessed ${guessed === 'ai' ? '🤖 AI' : '👤 human'}`}</span>`
            : ''
        }
      `;
      block.appendChild(p);
    }
    tEl.appendChild(block);
  }

  if (booth && booth.totalGuesses > 0) {
    document.getElementById('boothStat').textContent =
      `today at the booth · ${booth.sessions} sessions · ${booth.totalGuesses} guesses · avg accuracy ${pct(booth.accuracy)}`;
  }

  showScreen('reveal');
}
