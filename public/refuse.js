// REST version (no WebSocket). The client keeps a stable sessionId so votes
// and the demographic answer link together for the press-grade splits.
async function postJSON(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

const screens = {
  start: document.getElementById('start'),
  question: document.getElementById('question'),
  demographic: document.getElementById('demographic'),
  reveal: document.getElementById('reveal'),
};

const state = {
  sessionId: 'r-' + Math.random().toString(36).slice(2, 12),
  scenarios: [],
  demographicOptions: [],
  index: 0,
  votes: {}, // { questionId: optionId }
  demographic: null,
};

function showScreen(name) {
  for (const k of Object.keys(screens)) {
    screens[k].classList.toggle('active', k === name);
  }
}

document.getElementById('startBtn').addEventListener('click', async () => {
  const { scenarios, demographicOptions } = await (
    await fetch('/api/refuse/config')
  ).json();
  state.scenarios = scenarios;
  state.demographicOptions = demographicOptions ?? [];
  state.index = 0;
  state.votes = {};
  state.demographic = null;
  renderDemographicOptions();
  renderQuestion();
  showScreen('question');
});

document.getElementById('restartBtn').addEventListener('click', () => {
  window.location.reload();
});

function renderDemographicOptions() {
  const root = document.getElementById('demoOptions');
  if (!root) return;
  root.innerHTML = '';
  for (const opt of state.demographicOptions) {
    const btn = document.createElement('button');
    btn.className = 'q-option';
    btn.dataset.bucket = opt.id;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => submitDemographic(opt.id, btn));
    root.appendChild(btn);
  }
}

async function submitDemographic(bucket, btn) {
  state.demographic = bucket;
  document.querySelectorAll('#demoOptions button.q-option').forEach((b) => {
    b.disabled = true;
    if (b === btn) b.classList.add('picked');
  });
  await postJSON('/api/refuse/demographic', {
    sessionId: state.sessionId,
    bucket,
  });
  // small pause so the user feels the click registered, then complete
  setTimeout(goToFinal, 350);
}

document.getElementById('demoSkip').addEventListener('click', () => {
  goToFinal();
});

function renderQuestion() {
  const total = state.scenarios.length;
  const q = state.scenarios[state.index];
  document.getElementById('qProgress').textContent =
    `QUESTION ${state.index + 1} OF ${total}`;
  document.getElementById('qTitle').textContent = q.title;
  document.getElementById('qPrompt').textContent = q.prompt;

  const opts = document.getElementById('qOptions');
  opts.innerHTML = '';
  opts.classList.remove('locked');
  for (const opt of q.options) {
    const btn = document.createElement('button');
    btn.className = 'q-option';
    btn.dataset.optionId = opt.id;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => castVote(q.id, opt.id, btn));
    opts.appendChild(btn);
  }

  document.getElementById('qTally').classList.add('hidden');
  document.getElementById('qBars').innerHTML = '';
}

async function castVote(questionId, optionId, btn) {
  // Lock all options once one is picked
  const opts = document.getElementById('qOptions');
  opts.classList.add('locked');
  opts.querySelectorAll('button.q-option').forEach((b) => {
    b.disabled = true;
    if (b === btn) b.classList.add('picked');
  });
  state.votes[questionId] = optionId;
  const { tally } = await postJSON('/api/refuse/vote', {
    sessionId: state.sessionId,
    questionId,
    optionId,
  });
  const q = state.scenarios[state.index];
  if (q && q.id === questionId) renderTally(q, tally);
}

function renderTally(q, tally) {
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const bars = document.getElementById('qBars');
  bars.innerHTML = '';

  // Sort bars by largest first for clearer reading
  const ordered = [...q.options].sort(
    (a, b) => (tally[b.id] ?? 0) - (tally[a.id] ?? 0)
  );

  for (const opt of ordered) {
    const count = tally[opt.id] ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const isPick = state.votes[q.id] === opt.id;
    const row = document.createElement('div');
    row.className = `q-bar ${isPick ? 'picked' : ''}`;
    row.innerHTML = `
      <div class="q-bar-row">
        <div class="q-bar-label">${escape(opt.label)}${isPick ? ' <span class="your-pick">· your pick</span>' : ''}</div>
        <div class="q-bar-pct">${pct}%</div>
      </div>
      <div class="q-bar-track">
        <div class="q-bar-fill" style="width:${pct}%"></div>
      </div>
    `;
    bars.appendChild(row);
  }

  document.getElementById('qTally').classList.remove('hidden');
}

document.getElementById('qNext').addEventListener('click', () => {
  state.index += 1;
  if (state.index >= state.scenarios.length) {
    showScreen('demographic');
    return;
  }
  renderQuestion();
});

async function goToFinal() {
  let tallies = {};
  let totalToday = 0;
  try {
    const data = await (await fetch('/api/refuse-tally')).json();
    tallies = data.tallies ?? {};
    totalToday = data.totalToday ?? 0;
  } catch (e) {
    /* render with what we have */
  }
  document.getElementById('totalVoices').textContent =
    Number(totalToday).toLocaleString();
  const list = document.getElementById('revealList');
  list.innerHTML = '';
  for (const q of state.scenarios) {
    const myPick = state.votes[q.id];
    const pickLabel =
      q.options.find((o) => o.id === myPick)?.label ?? '(not voted)';
    const t = tallies[q.id] ?? {};
    const total = Object.values(t).reduce((a, b) => a + b, 0);
    const myPickPct =
      total > 0 ? Math.round(((t[myPick] ?? 0) / total) * 100) : 0;

    const block = document.createElement('div');
    block.className = 'reveal-block';
    block.innerHTML = `
      <div class="reveal-label">${escape(q.title.toUpperCase())}</div>
      <div class="reveal-prompt">${escape(q.prompt)}</div>
      <div class="reveal-pick">
        <span class="check">✓</span>
        <span><b>You chose:</b> ${escape(pickLabel)}</span>
      </div>
      <div class="reveal-aggregate">
        ${myPickPct}% of the booth agreed with you · ${total} total votes
      </div>
    `;
    list.appendChild(block);
  }
  showScreen('reveal');
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
