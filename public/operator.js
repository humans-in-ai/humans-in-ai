// =========================================================
// Booth Analytics — /operator
// =========================================================

const TRAIT_LABELS = {
  tone: { honest: 'Honest', kind: 'Kind' },
  priority: { efficiency: 'Efficiency', connection: 'Connection' },
  struggle: { solve: 'Action', sit: 'Presence' },
};
const TRAIT_ICONS = {
  honest: '🪞',
  kind: '🤲',
  efficiency: '⚡',
  connection: '🌊',
  solve: '🛠️',
  sit: '🫂',
};

// Stable, perceptually distinct palette for vote slices.
const SLICE_COLORS = ['#ff7a59', '#4f9dff', '#50e3a4', '#c79dff', '#f7c948'];

let lastAnalytics = null;

function pct(x) {
  if (!isFinite(x) || isNaN(x)) return '0%';
  return `${Math.round(x * 100)}%`;
}
function num(n) {
  return Number(n ?? 0).toLocaleString();
}
function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// =========================================================
// Fetchers
// =========================================================
async function fetchAnalytics() {
  const r = await fetch('/api/analytics');
  return r.json();
}
async function fetchInsights({ refresh = false } = {}) {
  const url = refresh
    ? '/api/analytics/insights?refresh=1'
    : '/api/analytics/insights';
  const r = await fetch(url);
  return r.json();
}
async function fetchPress() {
  const r = await fetch('/api/analytics/press');
  return r.json();
}

const DEMO_LABELS = {
  builder: 'Build AI products',
  daily: 'Use AI most days',
  sometimes: 'Use AI sometimes',
  rare: "Don't really use AI",
};

// =========================================================
// Hero stats
// =========================================================
function renderHero(a) {
  const map = {
    souls: num(a.counts.souls),
    wisdom: num(a.counts.wisdom),
    votes: num(a.counts.votes),
    completion: pct(a.counts.completionRate),
  };
  for (const [k, v] of Object.entries(map)) {
    const el = document.querySelector(`.hero-num[data-id="${k}"]`);
    if (el) el.textContent = v;
  }
  document.getElementById('dashSub').textContent =
    `${num(a.counts.sessions)} sessions started · ${num(a.counts.souls)} souls shaped · ${num(a.counts.votes)} votes`;
}

// =========================================================
// Sparkline — 24h activity
// =========================================================
function renderSpark(a) {
  const svg = document.getElementById('spark');
  const data = a.activity ?? [];
  const W = 600;
  const H = 120;
  const padX = 6;
  const padY = 14;
  svg.innerHTML = '';
  if (!data.length) return;
  const max = Math.max(
    1,
    ...data.flatMap((d) => [d.sessions, d.wisdom, d.votes])
  );
  const step = (W - padX * 2) / Math.max(1, data.length - 1);
  const yFor = (v) => H - padY - (v / max) * (H - padY * 2);
  const xFor = (i) => padX + i * step;

  const series = [
    { key: 'sessions', color: 'var(--accent-2)' },
    { key: 'wisdom', color: 'var(--accent)' },
    { key: 'votes', color: 'var(--good)' },
  ];

  // baseline
  const baseY = H - padY;
  svg.insertAdjacentHTML(
    'beforeend',
    `<line x1="${padX}" x2="${W - padX}" y1="${baseY}" y2="${baseY}" stroke="var(--line)" stroke-width="1" />`
  );

  for (const s of series) {
    const pts = data
      .map((d, i) => `${xFor(i).toFixed(1)},${yFor(d[s.key]).toFixed(1)}`)
      .join(' ');
    const areaPts =
      `${padX},${baseY} ` +
      pts +
      ` ${(W - padX).toFixed(1)},${baseY}`;
    svg.insertAdjacentHTML(
      'beforeend',
      `<polyline points="${areaPts}" fill="${s.color}" fill-opacity="0.10" stroke="none"/>` +
        `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    );
  }
}

// =========================================================
// Soul radar — 6 axes
// =========================================================
function renderRadar(a) {
  const svg = document.getElementById('radar');
  svg.innerHTML = '';
  const dims = [
    { key: 'honest', dim: 'tone' },
    { key: 'efficiency', dim: 'priority' },
    { key: 'solve', dim: 'struggle' },
    { key: 'kind', dim: 'tone' },
    { key: 'connection', dim: 'priority' },
    { key: 'sit', dim: 'struggle' },
  ];
  const counts = dims.map((d) => a.soul.traits[d.dim]?.[d.key] ?? 0);
  const max = Math.max(1, ...counts);
  const R = 90;

  // grid rings
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const pts = dims
      .map((_, i) => {
        const angle = (i / dims.length) * Math.PI * 2 - Math.PI / 2;
        return `${(Math.cos(angle) * R * f).toFixed(1)},${(Math.sin(angle) * R * f).toFixed(1)}`;
      })
      .join(' ');
    svg.insertAdjacentHTML(
      'beforeend',
      `<polygon points="${pts}" fill="none" stroke="var(--line)" stroke-width="1" stroke-opacity="${f === 1 ? 0.8 : 0.35}"/>`
    );
  }

  // axes
  for (let i = 0; i < dims.length; i++) {
    const angle = (i / dims.length) * Math.PI * 2 - Math.PI / 2;
    const x = (Math.cos(angle) * R).toFixed(1);
    const y = (Math.sin(angle) * R).toFixed(1);
    svg.insertAdjacentHTML(
      'beforeend',
      `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-opacity="0.4"/>`
    );

    const labelX = (Math.cos(angle) * (R + 14)).toFixed(1);
    const labelY = (Math.sin(angle) * (R + 14)).toFixed(1);
    const anchor =
      Math.abs(Math.cos(angle)) < 0.2
        ? 'middle'
        : Math.cos(angle) > 0
          ? 'start'
          : 'end';
    svg.insertAdjacentHTML(
      'beforeend',
      `<text x="${labelX}" y="${labelY}" font-size="10" fill="var(--muted)" text-anchor="${anchor}" dominant-baseline="middle" letter-spacing="1">${TRAIT_ICONS[dims[i].key]} ${escape(TRAIT_LABELS[dims[i].dim][dims[i].key])}</text>`
    );
  }

  // data polygon
  const pts = dims
    .map((d, i) => {
      const angle = (i / dims.length) * Math.PI * 2 - Math.PI / 2;
      const r = (counts[i] / max) * R;
      return `${(Math.cos(angle) * r).toFixed(1)},${(Math.sin(angle) * r).toFixed(1)}`;
    })
    .join(' ');
  svg.insertAdjacentHTML(
    'beforeend',
    `<polygon points="${pts}" fill="var(--accent)" fill-opacity="0.25" stroke="var(--accent)" stroke-width="2"/>`
  );

  // data points
  dims.forEach((d, i) => {
    const angle = (i / dims.length) * Math.PI * 2 - Math.PI / 2;
    const r = (counts[i] / max) * R;
    const x = (Math.cos(angle) * r).toFixed(1);
    const y = (Math.sin(angle) * r).toFixed(1);
    svg.insertAdjacentHTML(
      'beforeend',
      `<circle cx="${x}" cy="${y}" r="3" fill="var(--accent)"/>`
    );
  });

  // legend
  const legend = document.getElementById('radarLegend');
  legend.innerHTML = dims
    .map(
      (d, i) =>
        `<span class="legend-chip">${TRAIT_ICONS[d.key]} ${escape(TRAIT_LABELS[d.dim][d.key])} <b>${counts[i]}</b></span>`
    )
    .join('');
}

// =========================================================
// Heatmap — 2 (tone) × 4 (priority×struggle) = 8 cells
// =========================================================
function renderHeatmap(a) {
  const root = document.getElementById('heatmap');
  root.innerHTML = '';
  const tones = ['honest', 'kind'];
  const cols = [
    ['efficiency', 'solve'],
    ['efficiency', 'sit'],
    ['connection', 'solve'],
    ['connection', 'sit'],
  ];

  // index combos for fast lookup
  const map = {};
  for (const c of a.soul.combos ?? []) {
    map[`${c.tone}.${c.priority}.${c.struggle}`] = c.count;
  }
  const max = Math.max(1, ...Object.values(map), 1);

  // header row: empty cell + 4 column headers
  const header = document.createElement('div');
  header.className = 'heatmap-row header';
  header.innerHTML =
    `<div class="heatmap-corner"></div>` +
    cols
      .map(
        ([p, s]) =>
          `<div class="heatmap-colhead">${TRAIT_ICONS[p]}<br/>${escape(TRAIT_LABELS.priority[p])}<br/><span class="dim">${TRAIT_ICONS[s]} ${escape(TRAIT_LABELS.struggle[s])}</span></div>`
      )
      .join('');
  root.appendChild(header);

  for (const t of tones) {
    const row = document.createElement('div');
    row.className = 'heatmap-row';
    row.innerHTML =
      `<div class="heatmap-rowhead">${TRAIT_ICONS[t]} ${escape(TRAIT_LABELS.tone[t])}</div>` +
      cols
        .map(([p, s]) => {
          const count = map[`${t}.${p}.${s}`] ?? 0;
          const intensity = count / max;
          // base color is accent; fade alpha by intensity
          const alpha = 0.06 + intensity * 0.85;
          return `<div class="heatmap-cell" style="background: rgba(255, 122, 89, ${alpha.toFixed(3)})" title="${count} visitors"><span class="heatmap-num">${count}</span></div>`;
        })
        .join('');
    root.appendChild(row);
  }
}

// =========================================================
// Word cloud
// =========================================================
const STOPWORDS = new Set(
  ('a an and or but the is are was were be been being it its this that these those we us our you your i me my mine they them their for of to in on at by from with as if so do does did has have had can could would should will may might just like all also too very more most many some any each every other another such no none not yes do don dont about after before between into off onto over up down out off again only own same than then now well thing things really actually basically literally pretty quite even still though however therefore thus furthermore moreover meanwhile additionally use using using used uses make makes made making get gets got getting take takes took taking go goes going gone went').split(
    ' '
  )
);

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !STOPWORDS.has(w) &&
        !/^\d+$/.test(w) &&
        !/^['-]+$/.test(w)
    );
}

function buildWordCounts(wisdomList) {
  const counts = new Map();
  for (const w of wisdomList) {
    for (const tok of tokenize(w.text)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function renderWordCloud(a) {
  const root = document.getElementById('wordCloud');
  root.innerHTML = '';
  const wisdomList = a.wisdom ?? [];
  if (!wisdomList.length) {
    root.innerHTML = '<p class="loading">no wisdom yet — once visitors leave their mark, this fills with their words</p>';
    return;
  }
  const counts = buildWordCounts(wisdomList);
  if (!counts.length) {
    root.innerHTML = '<p class="loading">not enough wisdom yet to surface words</p>';
    return;
  }
  const top = counts.slice(0, 60);
  const max = top[0][1];
  const min = top[top.length - 1][1];
  const palette = [
    'var(--accent)',
    'var(--accent-2)',
    'var(--good)',
    '#c79dff',
    '#f7c948',
    'var(--text)',
  ];

  // Shuffle a copy so size order isn't strictly alternating colors
  const shuffled = [...top];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (const [word, count] of shuffled) {
    const norm =
      max === min ? 1 : (count - min) / (max - min); // 0..1
    const size = Math.round(14 + norm * 38); // 14px → 52px
    const opacity = 0.55 + norm * 0.45;
    const color = palette[Math.floor(Math.random() * palette.length)];
    const span = document.createElement('span');
    span.className = 'cloud-word';
    span.title = `${word} · ${count} mentions`;
    span.style.fontSize = `${size}px`;
    span.style.color = color;
    span.style.opacity = opacity.toFixed(2);
    span.textContent = word;
    root.appendChild(span);
  }
}

// =========================================================
// Donut charts for refuse scenarios
// =========================================================
function describeArc(cx, cy, r, startAngle, endAngle) {
  const polar = (a) => [
    cx + r * Math.cos(a - Math.PI / 2),
    cy + r * Math.sin(a - Math.PI / 2),
  ];
  const [sx, sy] = polar(startAngle);
  const [ex, ey] = polar(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

function renderDonut(scenario) {
  const total = scenario.total;
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 64;
  const stroke = 18;

  let svg = `<svg viewBox="0 0 ${size} ${size}" class="donut">`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--panel-2)" stroke-width="${stroke}"/>`;
  if (total > 0) {
    let acc = 0;
    scenario.breakdown.forEach((b, i) => {
      const slice = b.pct;
      if (slice <= 0) return;
      const start = acc * Math.PI * 2;
      const end = (acc + slice) * Math.PI * 2;
      // Tiny epsilon so a 100% slice still draws as a near-full arc
      const drawEnd = slice >= 0.999 ? end - 0.001 : end;
      svg += `<path d="${describeArc(cx, cy, r, start, drawEnd)}" stroke="${SLICE_COLORS[i % SLICE_COLORS.length]}" stroke-width="${stroke}" fill="none" stroke-linecap="butt"/>`;
      acc += slice;
    });
  }
  svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" font-weight="700" fill="var(--text)">${total}</text>`;
  svg += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="var(--muted)" letter-spacing="1.2">VOTES</text>`;
  svg += `</svg>`;
  return svg;
}

function renderRefuse(a) {
  const list = document.getElementById('donutGrid');
  list.innerHTML = '';
  for (const s of a.refuse.scenarios) {
    const block = document.createElement('div');
    block.className = 'donut-card';
    const legend = s.breakdown
      .map(
        (b, i) => `
        <div class="donut-legend-row">
          <span class="donut-swatch" style="background:${SLICE_COLORS[i % SLICE_COLORS.length]}"></span>
          <span class="donut-legend-label">${escape(b.label)}</span>
          <span class="donut-legend-pct">${pct(b.pct)}</span>
        </div>
      `
      )
      .join('');
    block.innerHTML = `
      <div class="donut-head">
        <h3>${escape(s.title)}</h3>
        <p class="donut-prompt">${escape(s.prompt)}</p>
      </div>
      ${renderDonut(s)}
      <div class="donut-legend">${legend}</div>
    `;
    list.appendChild(block);
  }

  const cont = a.refuse.mostContentious;
  const align = a.refuse.mostAligned;
  const c = document.getElementById('contentionCard');
  if (cont) {
    c.querySelector('[data-id="title"]').textContent = cont.title;
    c.querySelector('[data-id="detail"]').textContent =
      cont.total > 0
        ? `${cont.total} votes split — entropy ${cont.entropy.toFixed(2)}`
        : 'no votes yet';
  }
  const al = document.getElementById('alignedCard');
  if (align) {
    al.querySelector('[data-id="title"]').textContent = align.title;
    if (align.dominant && align.total > 0) {
      al.querySelector('[data-id="detail"]').textContent =
        `${pct(align.dominant.pct)} agreed on “${align.dominant.label}”`;
    } else {
      al.querySelector('[data-id="detail"]').textContent = 'no votes yet';
    }
  }
}

// =========================================================
// Soul hotspot line
// =========================================================
function renderSoulHotspot(a) {
  const h = a.soul.hotspot;
  const el = document.getElementById('soulHotspot');
  if (!h) {
    el.textContent = 'no soul-shaping data yet';
    return;
  }
  el.innerHTML = `Most popular AI persona: <b>${TRAIT_ICONS[h.tone]} ${escape(TRAIT_LABELS.tone[h.tone])} · ${TRAIT_ICONS[h.priority]} ${escape(TRAIT_LABELS.priority[h.priority])} · ${TRAIT_ICONS[h.struggle]} ${escape(TRAIT_LABELS.struggle[h.struggle])}</b> — chosen by <b>${num(h.count)}</b> visitors (${pct(h.pct)}).`;
}

// =========================================================
// AI insights (compact)
// =========================================================
function renderInsights(insights) {
  if (!insights) return;
  document.getElementById('aiNarrative').textContent =
    insights.narrative ?? '—';
  document.getElementById('aiSurprising').textContent =
    insights.surprising ?? '—';

  const themesEl = document.getElementById('themes');
  themesEl.innerHTML = '';
  const themes = insights.themes ?? [];
  if (!themes.length) {
    themesEl.innerHTML = '<p class="dim small">no themes yet</p>';
  } else {
    for (const t of themes) {
      const card = document.createElement('div');
      card.className = 'theme-card';
      card.innerHTML = `<div class="theme-title">${escape(t.title)}</div><div class="theme-desc">${escape(t.description)}</div>`;
      themesEl.appendChild(card);
    }
  }

  const quotesEl = document.getElementById('quotes');
  quotesEl.innerHTML = '';
  const quotes = insights.quotes ?? [];
  if (!quotes.length) {
    quotesEl.innerHTML = '<p class="dim small">no quotes yet</p>';
  } else {
    for (const q of quotes) {
      const card = document.createElement('div');
      card.className = 'quote-card';
      card.innerHTML = `<div class="quote-text">“${escape(q.text)}”</div><div class="quote-why">${escape(q.why)}</div>`;
      quotesEl.appendChild(card);
    }
  }
}

// =========================================================
// Press kit (headline block at top of dashboard)
// =========================================================
function renderPressKit(kit) {
  if (!kit) return;
  document.getElementById('pressHeadline').textContent =
    kit.headline ?? 'Awaiting data — once visitors vote, the headline lands here.';
  document.getElementById('pressSubhead').textContent =
    kit.subhead ?? '';
  document.getElementById('pressLede').textContent =
    kit.lede ?? '';
  const findingsEl = document.getElementById('pressFindings');
  findingsEl.innerHTML = '';
  for (const f of kit.findings ?? []) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${escape(f.claim ?? '')}</b>${f.context ? `<div class="finding-context">${escape(f.context)}</div>` : ''}`;
    findingsEl.appendChild(li);
  }
  document.getElementById('pressMethodology').textContent =
    `Methodology — ${kit.sampleSize.souls} AI persona-shaping sessions · ${kit.sampleSize.votes} votes across 5 scenarios · ${kit.sampleSize.wisdom} wisdom submissions · ${kit.sampleSize.demographicTotal} respondents to a self-id question. ${kit.venue}, ${kit.location}, ${kit.dateStr}.`;
}

// =========================================================
// Public-vs-industry gap chart
// =========================================================
function renderGapChart(a) {
  const root = document.getElementById('gapChart');
  root.innerHTML = '';
  const scenarios = (a.refuse?.scenarios ?? []).filter(
    (s) => s.industryPermissive != null && s.total > 0
  );
  if (!scenarios.length) {
    root.innerHTML =
      '<p class="loading">no comparable votes yet — once a few sessions complete the new questions, the gap appears here.</p>';
    return;
  }
  // Sort by absolute gap descending — biggest news at top.
  scenarios.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  for (const s of scenarios) {
    const block = document.createElement('div');
    block.className = 'gap-row';
    const publicPct = (s.refusePct * 100).toFixed(0);
    const industryRefusePct = ((1 - s.industryPermissive) * 100).toFixed(0);
    const gapAbs = Math.abs(s.gap * 100).toFixed(0);
    const direction = s.gap >= 0 ? 'stricter' : 'looser';
    block.innerHTML = `
      <div class="gap-head">
        <h3>${escape(s.title)}</h3>
        <span class="gap-badge ${s.gap >= 0 ? 'pos' : 'neg'}">${gapAbs}-pt gap · public is ${direction}</span>
      </div>
      <div class="gap-bar-row">
        <div class="gap-bar-label">Public says refuse</div>
        <div class="gap-bar"><div class="gap-fill public" style="width:${publicPct}%"></div></div>
        <div class="gap-bar-pct">${publicPct}%</div>
      </div>
      <div class="gap-bar-row">
        <div class="gap-bar-label">Industry refuses</div>
        <div class="gap-bar"><div class="gap-fill industry" style="width:${industryRefusePct}%"></div></div>
        <div class="gap-bar-pct">${industryRefusePct}%</div>
      </div>
      <p class="gap-note">${escape(s.industry ?? '')}</p>
    `;
    root.appendChild(block);
  }
}

// =========================================================
// Demographic split — per scenario, refuse rate per bucket
// =========================================================
function renderDemoSplit(a) {
  const root = document.getElementById('demoSplit');
  root.innerHTML = '';
  const scenarios = (a.refuse?.scenarios ?? []).filter((s) => s.total > 0);
  if (!scenarios.length) {
    root.innerHTML = '<p class="loading">no demographic data yet</p>';
    return;
  }
  for (const s of scenarios) {
    const block = document.createElement('div');
    block.className = 'demo-row';
    const buckets = ['builder', 'daily', 'sometimes', 'rare'];
    const bars = buckets
      .map((b) => {
        const ds = s.demoSplit?.[b] ?? { total: 0, refusePct: 0 };
        const pct = (ds.refusePct * 100).toFixed(0);
        return `
        <div class="demo-bar-row" title="${ds.total} ${b} votes">
          <div class="demo-bar-label">${escape(DEMO_LABELS[b])}</div>
          <div class="demo-bar"><div class="demo-fill" style="width:${pct}%"></div></div>
          <div class="demo-bar-pct">${pct}% refuse <span class="dim small">· n=${ds.total}</span></div>
        </div>
      `;
      })
      .join('');
    block.innerHTML = `
      <h3>${escape(s.title)}</h3>
      <div class="demo-bars">${bars}</div>
    `;
    root.appendChild(block);
  }
}

function renderGeneratedTime(a) {
  if (!a) return;
  document.getElementById('genTime').textContent = new Date(
    a.generatedAt
  ).toLocaleString();
}

// =========================================================
// Wire-up
// =========================================================
async function loadAll({ refreshInsights = false } = {}) {
  try {
    const [analytics, insights, press] = await Promise.all([
      fetchAnalytics(),
      fetchInsights({ refresh: refreshInsights }),
      fetchPress(),
    ]);
    lastAnalytics = analytics;
    renderPressKit(press);
    renderGapChart(analytics);
    renderDemoSplit(analytics);
    renderHero(analytics);
    renderSpark(analytics);
    renderRadar(analytics);
    renderHeatmap(analytics);
    renderSoulHotspot(analytics);
    renderWordCloud(analytics);
    renderRefuse(analytics);
    renderInsights(insights);
    renderGeneratedTime(analytics);
  } catch (err) {
    console.error('analytics load failed', err);
    document.getElementById('aiNarrative').textContent =
      `failed to load: ${String(err.message ?? err)}`;
  }
}

document.getElementById('refreshBtn').addEventListener('click', () => loadAll());
document
  .getElementById('regenerateBtn')
  .addEventListener('click', () => loadAll({ refreshInsights: true }));
document.getElementById('exportBtn').addEventListener('click', () => {
  window.location.href = '/api/analytics/export';
});
document.getElementById('pressBtn').addEventListener('click', () => {
  window.location.href = '/api/analytics/press-release.md';
});

loadAll();
// Quiet refresh of charts every 20s (no AI re-call).
setInterval(async () => {
  try {
    const a = await fetchAnalytics();
    lastAnalytics = a;
    renderHero(a);
    renderSpark(a);
    renderRadar(a);
    renderHeatmap(a);
    renderSoulHotspot(a);
    renderWordCloud(a);
    renderRefuse(a);
    renderGapChart(a);
    renderDemoSplit(a);
    renderGeneratedTime(a);
  } catch {}
}, 20000);
