const socket = io();
const feedEl = document.getElementById('feed');
const countEl = document.getElementById('wallCount');

socket.emit('wall:join');

socket.on('wall:hydrate', ({ items, total }) => {
  countEl.textContent = total;
  feedEl.innerHTML = '';
  // Render newest at top.
  for (const item of items) {
    feedEl.appendChild(makeTile(item, false));
  }
});

socket.on('wisdom:new', ({ item, total }) => {
  countEl.textContent = total;
  const tile = makeTile(item, true);
  feedEl.prepend(tile);
  // soft-flash, then drop the highlight class after the animation
  setTimeout(() => tile.classList.remove('fresh'), 2000);
  // cap displayed tiles to avoid memory bloat
  const max = 80;
  while (feedEl.children.length > max) {
    feedEl.removeChild(feedEl.lastChild);
  }
});

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
