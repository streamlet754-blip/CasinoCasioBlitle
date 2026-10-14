(() => {
  const STARTING_CHIPS = 1000;
  const MAX_CHIPS = 10000000;
  const STORAGE_KEY = 'pocket-arcade-play-chips';
  const HISTORY_KEY = 'pocket-arcade-round-history';
  const numberFormat = new Intl.NumberFormat('en-US');
  const balanceNode = document.querySelector('#chip-balance');
  const historyList = document.querySelector('#round-history-list');
  const resetButton = document.querySelector('#reset-chips');
  const tabs = Array.from(document.querySelectorAll('[data-game-tab]'));
  const views = Array.from(document.querySelectorAll('[data-game-view]'));
  const crashCanvas = document.querySelector('#crash-canvas');
  const crashContext = crashCanvas.getContext('2d');
  const plinkoCanvas = document.querySelector('#plinko-canvas');
  const plinkoContext = plinkoCanvas.getContext('2d');
  const minesGrid = document.querySelector('#mines-grid');
  let chips = loadInteger(STORAGE_KEY, STARTING_CHIPS);
  let history = loadHistory();
  let crashRound = null;
  let plinkoRound = null;
  let minesRound = null;

  function loadInteger(key, fallback) {
    try {
      const parsed = Number.parseInt(localStorage.getItem(key), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, MAX_CHIPS) : fallback;
    } catch {
      return fallback;
    }
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
    } catch {
      return [];
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      return;
    }
  }

  function renderBalance() {
    balanceNode.textContent = numberFormat.format(chips);
    resetButton.disabled = Boolean(crashRound || plinkoRound || minesRound);
  }

  function changeBalance(delta) {
    chips = Math.max(0, Math.min(MAX_CHIPS, chips + Math.trunc(delta)));
    save(STORAGE_KEY, chips);
    renderBalance();
  }

  function renderHistory() {
    historyList.replaceChildren();
    if (history.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No rounds yet';
      historyList.append(item);
      return;
    }
    for (const round of history) {
      const item = document.createElement('li');
      item.className = round.won ? 'win' : 'loss';
      item.textContent = `${round.game} · ${numberFormat.format(round.stake)} → ${numberFormat.format(round.returned)} chips`;
      historyList.append(item);
    }
  }

  function recordRound(game, stake, returned) {
    history.unshift({ game, stake, returned, won: returned >= stake });
    history = history.slice(0, 6);
    save(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  }

  function message(id, text, tone = '') {
    const node = document.querySelector(`#${id}`);
    node.textContent = text;
    node.className = `game-message${tone ? ` ${tone}` : ''}`;
  }

  function readStake(inputId, messageId) {
    const value = Number(document.querySelector(`#${inputId}`).value);
    if (!Number.isSafeInteger(value) || value < 1) {
      message(messageId, 'Enter a whole-number bet above zero.', 'bad');
      return 0;
    }
    if (value > chips) {
      message(messageId, 'Your play-chip balance is too low.', 'bad');
      return 0;
    }
    return value;
  }

  function switchGame(game) {
    for (const tab of tabs) {
      const selected = tab.dataset.gameTab === game;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', String(selected));
    }
    for (const view of views) {
      const selected = view.dataset.gameView === game;
      view.classList.toggle('selected', selected);
      view.hidden = !selected;
    }
    if (game === 'crash') drawCrash(crashRound ? crashRound.multiplier : 1);
    if (game === 'plinko' && !plinkoRound) drawPlinko();
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => switchGame(tab.dataset.gameTab));
  }

  function drawCrash(multiplier, busted = false) {
    const context = crashContext;
    const width = crashCanvas.width;
    const height = crashCanvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#141914';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = '#2a332a';
    context.lineWidth = 1;
    for (let x = 56; x < width; x += 90) {
      context.beginPath();
      context.moveTo(x, 32);
      context.lineTo(x, height - 48);
      context.stroke();
    }
    for (let y = 50; y < height - 32; y += 70) {
      context.beginPath();
      context.moveTo(40, y);
      context.lineTo(width - 24, y);
      context.stroke();
    }

    const progress = crashRound ? Math.min(1, (performance.now() - crashRound.startedAt) / 6500) : .58;
    const endX = 56 + progress * (width - 112);
    const endY = Math.max(54, height - 62 - Math.log(multiplier) * 105);
    context.beginPath();
    context.moveTo(56, height - 62);
    context.bezierCurveTo(width * .31, height - 70, width * .45, height - 115, endX, endY);
    context.strokeStyle = busted ? '#ff986b' : '#d1f36a';
    context.lineWidth = 5;
    context.shadowBlur = 17;
    context.shadowColor = busted ? '#ff986b77' : '#d1f36a66';
    context.stroke();
    context.shadowBlur = 0;
    if (crashRound) {
      context.beginPath();
      context.arc(endX, endY, 9, 0, Math.PI * 2);
      context.fillStyle = busted ? '#ff986b' : '#efffc1';
      context.fill();
    }
    const stage = document.querySelector('.crash-stage');
    stage.classList.toggle('running', Boolean(crashRound));
    stage.classList.toggle('busted', busted);
    document.querySelector('#crash-multiplier').textContent = `${multiplier.toFixed(2)}x`;
  }

  function settleCrashLoss() {
    if (!crashRound) return;
    const lost = crashRound;
    crashRound = null;
    document.querySelector('#crash-start').disabled = false;
    document.querySelector('#crash-cashout').disabled = true;
    document.querySelector('#crash-status').textContent = 'CRASHED';
    message('crash-message', `Round over. ${numberFormat.format(lost.stake)} play chips stayed in the game.`, 'bad');
    recordRound('Crash', lost.stake, 0);
    drawCrash(lost.multiplier, true);
    renderBalance();
  }

  function updateCrash(now) {
    if (!crashRound) return;
    const multiplier = Math.exp((now - crashRound.startedAt) / 6500);
    crashRound.multiplier = multiplier;
    document.querySelector('#crash-status').textContent = 'MULTIPLIER';
    drawCrash(multiplier);
    if (multiplier >= crashRound.crashAt) {
      settleCrashLoss();
      return;
    }
    requestAnimationFrame(updateCrash);
  }

  document.querySelector('#crash-start').addEventListener('click', () => {
    if (crashRound) return;
    const stake = readStake('crash-bet', 'crash-message');
    if (!stake) return;
    changeBalance(-stake);
    crashRound = {
      stake,
      multiplier: 1,
      crashAt: Math.min(30, Math.max(1.12, .99 / (1 - Math.random()))),
      startedAt: performance.now(),
    };
    document.querySelector('#crash-start').disabled = true;
    document.querySelector('#crash-cashout').disabled = false;
    document.querySelector('#crash-status').textContent = 'MULTIPLIER';
    message('crash-message', 'Cash out before the line breaks.');
    requestAnimationFrame(updateCrash);
  });

  document.querySelector('#crash-cashout').addEventListener('click', () => {
    if (!crashRound) return;
    const now = performance.now();
    const multiplier = Math.exp((now - crashRound.startedAt) / 6500);
    if (multiplier >= crashRound.crashAt) {
      crashRound.multiplier = multiplier;
      settleCrashLoss();
      return;
    }
    const won = crashRound;
    const returned = Math.floor(won.stake * multiplier);
    crashRound = null;
    changeBalance(returned);
    document.querySelector('#crash-start').disabled = false;
    document.querySelector('#crash-cashout').disabled = true;
    document.querySelector('#crash-status').textContent = 'CASHED OUT';
    message('crash-message', `Returned ${numberFormat.format(returned)} play chips at ${multiplier.toFixed(2)}x.`, 'good');
    recordRound('Crash', won.stake, returned);
    drawCrash(multiplier);
    renderBalance();
  });

  function drawPlinko(ball = null, trail = []) {
    const context = plinkoContext;
    const width = plinkoCanvas.width;
    const height = plinkoCanvas.height;
    const center = width / 2;
    const spacing = 62;
    const top = 70;
    const gap = 40;
    const rows = 8;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#141914';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#a2ada0';
    context.font = '12px DM Mono, monospace';
    context.textAlign = 'center';
    context.fillText('DROP', center, 30);
    context.fillStyle = '#d1f36a';
    context.beginPath();
    context.moveTo(center, 40);
    context.lineTo(center - 8, 55);
    context.lineTo(center + 8, 55);
    context.closePath();
    context.fill();
    for (let row = 0; row < rows; row += 1) {
      const y = top + row * gap;
      for (let pin = 0; pin <= row; pin += 1) {
        const x = center + (2 * pin - row) * spacing / 2;
        context.beginPath();
        context.arc(x, y, 5, 0, Math.PI * 2);
        context.fillStyle = '#a2ada0';
        context.fill();
      }
    }
    if (trail.length > 1) {
      context.beginPath();
      trail.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.strokeStyle = '#d1f36a99';
      context.lineWidth = 3;
      context.stroke();
    }
    if (ball) {
      context.beginPath();
      context.arc(ball.x, ball.y, 10, 0, Math.PI * 2);
      context.fillStyle = '#d1f36a';
      context.shadowBlur = 20;
      context.shadowColor = '#d1f36a';
      context.fill();
      context.shadowBlur = 0;
    }
    const bins = 9;
    const binY = top + rows * gap + 13;
    for (let index = 0; index < bins; index += 1) {
      const x = center + (2 * index - (bins - 1)) * spacing / 2;
      context.fillStyle = index === 0 || index === bins - 1 ? '#ff986b33' : '#d1f36a1c';
      context.fillRect(x - spacing / 2 + 2, binY, spacing - 4, 26);
      context.fillStyle = '#a2ada0';
      context.font = '10px DM Mono, monospace';
      context.fillText(String(index), x, binY + 17);
    }
  }

  function finishPlinko(round) {
    const payouts = {
      low: [4, 2, 1.5, 1.2, 1, 1.2, 1.5, 2, 4],
      medium: [12, 4, 2, 1.1, .4, 1.1, 2, 4, 12],
      high: [40, 10, 3, .5, .2, .5, 3, 10, 40],
    };
    const multiplier = payouts[round.risk][round.rights];
    const returned = Math.floor(round.stake * multiplier);
    plinkoRound = null;
    changeBalance(returned);
    document.querySelector('#plinko-drop').disabled = false;
    const messageText = `Bin ${round.rights + 1} · ${multiplier.toFixed(2)}x · ${numberFormat.format(returned)} play chips returned.`;
    message('plinko-message', messageText, returned >= round.stake ? 'good' : 'bad');
    recordRound('Plinko', round.stake, returned);
    drawPlinko();
    renderBalance();
  }

  function animatePlinko(now) {
    if (!plinkoRound) return;
    const round = plinkoRound;
    const step = round.step;
    if (step >= round.directions.length) {
      finishPlinko(round);
      return;
    }
    const direction = round.directions[step];
    const targetX = round.fromX + (direction ? 31 : -31);
    const targetY = 70 + (step + 1) * 40;
    const progress = Math.min(1, (now - round.stepStarted) / 170);
    const eased = progress * progress * (3 - 2 * progress);
    const x = round.fromX + (targetX - round.fromX) * eased;
    const y = round.fromY + (targetY - round.fromY) * eased;
    const trail = round.path.concat([{ x, y }]);
    drawPlinko({ x, y }, trail);
    if (progress >= 1) {
      round.path.push({ x: targetX, y: targetY });
      round.fromX = targetX;
      round.fromY = targetY;
      round.rights += direction ? 1 : 0;
      round.step += 1;
      round.stepStarted = now;
    }
    requestAnimationFrame(animatePlinko);
  }

  document.querySelector('#plinko-drop').addEventListener('click', () => {
    if (plinkoRound) return;
    const stake = readStake('plinko-bet', 'plinko-message');
    if (!stake) return;
    changeBalance(-stake);
    plinkoRound = {
      stake,
      risk: document.querySelector('#plinko-risk').value,
      directions: Array.from({ length: 8 }, () => Math.random() < .5 ? 0 : 1),
      rights: 0,
      step: 0,
      fromX: plinkoCanvas.width / 2,
      fromY: 42,
      stepStarted: performance.now(),
      path: [{ x: plinkoCanvas.width / 2, y: 42 }],
    };
    document.querySelector('#plinko-drop').disabled = true;
    message('plinko-message', 'Ball in play…');
    requestAnimationFrame(animatePlinko);
  });

  for (let index = 0; index < 25; index += 1) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'mine-tile';
    tile.textContent = String(index + 1).padStart(2, '0');
    tile.setAttribute('aria-label', `Tile ${index + 1}`);
    tile.addEventListener('click', () => pickMineTile(index, tile));
    minesGrid.append(tile);
  }

  function currentMinesMultiplier(round) {
    return 1 + round.safe * (.18 + round.mineCount * .025) + round.safe * round.safe * .015;
  }

  function renderMineTile(tile, kind, label) {
    tile.classList.add(kind);
    tile.textContent = label;
    tile.disabled = true;
  }

  function pickMineTile(index, tile) {
    if (!minesRound || minesRound.revealed.has(index)) return;
    minesRound.revealed.add(index);
    if (minesRound.mines.has(index)) {
      renderMineTile(tile, 'mine', 'X');
      for (const mine of minesRound.mines) {
        const otherTile = minesGrid.children[mine];
        if (!minesRound.revealed.has(mine)) renderMineTile(otherTile, 'mine', 'X');
      }
      const lost = minesRound;
      minesRound = null;
      for (const otherTile of minesGrid.children) otherTile.disabled = true;
      document.querySelector('#mines-start').disabled = false;
      document.querySelector('#mines-cashout').disabled = true;
      message('mines-message', `Mine found. ${numberFormat.format(lost.stake)} play chips lost.`, 'bad');
      recordRound('Mines', lost.stake, 0);
      renderBalance();
      return;
    }

    minesRound.safe += 1;
    renderMineTile(tile, 'safe', '+');
    const multiplier = currentMinesMultiplier(minesRound);
    document.querySelector('#mines-cashout').textContent = `Cash out · ${multiplier.toFixed(2)}x`;
    document.querySelector('#mines-cashout').disabled = false;
    message('mines-message', `${minesRound.safe} safe · ${multiplier.toFixed(2)}x. Cash out or pick again.`, 'good');
    if (minesRound.safe === 25 - minesRound.mineCount) cashOutMines();
  }

  function cashOutMines() {
    if (!minesRound || minesRound.safe === 0) return;
    const won = minesRound;
    const multiplier = currentMinesMultiplier(won);
    const returned = Math.floor(won.stake * multiplier);
    minesRound = null;
    for (const tile of minesGrid.children) tile.disabled = true;
    changeBalance(returned);
    document.querySelector('#mines-start').disabled = false;
    document.querySelector('#mines-cashout').disabled = true;
    message('mines-message', `Returned ${numberFormat.format(returned)} play chips at ${multiplier.toFixed(2)}x.`, 'good');
    recordRound('Mines', won.stake, returned);
    renderBalance();
  }

  document.querySelector('#mines-start').addEventListener('click', () => {
    if (minesRound) return;
    const stake = readStake('mines-bet', 'mines-message');
    if (!stake) return;
    const mineCount = Number(document.querySelector('#mine-count').value);
    const mineSet = new Set();
    while (mineSet.size < mineCount) mineSet.add(Math.floor(Math.random() * 25));
    minesRound = { stake, mineCount, mines: mineSet, safe: 0, revealed: new Set() };
    changeBalance(-stake);
    for (const tile of minesGrid.children) {
      tile.className = 'mine-tile';
      tile.disabled = false;
      tile.textContent = String(Number(tile.getAttribute('aria-label').slice(5))).padStart(2, '0');
    }
    document.querySelector('#mines-start').disabled = true;
    document.querySelector('#mines-cashout').disabled = true;
    document.querySelector('#mines-cashout').textContent = 'Cash out · 1.00x';
    message('mines-message', `Pick a tile. There are ${mineCount} hidden mines.`);
  });

  document.querySelector('#mines-cashout').addEventListener('click', cashOutMines);

  resetButton.addEventListener('click', () => {
    if (crashRound || plinkoRound || minesRound) return;
    chips = STARTING_CHIPS;
    save(STORAGE_KEY, chips);
    renderBalance();
    message('crash-message', 'Play-chip balance reset to 1,000.');
  });

  renderBalance();
  renderHistory();
  drawCrash(1);
  drawPlinko();
})();