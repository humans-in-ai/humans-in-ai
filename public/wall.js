// Live wisdom wall — polls the feed every few seconds (no WebSocket) and
// animates in any wisdom it hasn't shown yet.
const feedEl = document.getElementById('feed');
const countEl = document.getElementById('wallCount');

const shownIds = new Set();
let first = true;

async function poll() {
  let data;
  try {
    data = await (await fetch('/api/wisdom-feed')).json();
  } catch (e) {
    return;
  }
  const { items, total } = data;
  countEl.textContent = total;

  if (first) {
    feedEl.innerHTML = '';
    // items arrive newest-first; appending in order puts newest on top.
    for (const item of items) {
      shownIds.add(item.id);
      feedEl.appendChild(makeTile(item, false));
    }
    first = false;
    return;
  }

  // Prepend new items oldest→newest so the very newest ends up on top.
  const fresh = items.filter((it) => !shownIds.has(it.id));
  for (const item of [...fresh].reverse()) {
    shownIds.add(item.id);
    const tile = makeTile(item, true);
    feedEl.prepend(tile);
    setTimeout(() => tile.classList.remove('fresh'), 2000);
  }
  // cap displayed tiles to avoid memory bloat
  const max = 80;
  while (feedEl.children.length > max) {
    feedEl.removeChild(feedEl.lastChild);
  }
}

function makeTile(item, fresh) {
  const tile = document.createElement('div');
  tile.className = 'wisdom-tile' + (fresh ? ' fresh' : '');
  const num = document.createElement('div');
  num.className = 'wisdom-num';
  num.textContent = `#${item.id}`;
  const txt = document.createElement('div');
  txt.className = 'wisdom-text';
  txt.textContent = item.text;
  tile.appendChild(num);
  tile.appendChild(txt);
  return tile;
}

poll();
setInterval(poll, 3000);
