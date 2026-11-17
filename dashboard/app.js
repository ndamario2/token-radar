// Token Radar dashboard — reads window.RADAR (written by main.ts from the same
// board), renders the board, and opens a detail view per protocol. Static page:
// no network, no framework, no external assets. State lives in location.hash,
// so #p=<slug> opens a detail view and #cat=<category> a filtered board.

const D = window.RADAR;
const $ = (id) => document.getElementById(id);

function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + String(n);
}
function pct(v) {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}
function ageLabel(days) {
  if (days >= 365) return (days / 365).toFixed(1) + 'y';
  if (days >= 30) return Math.round(days / 30) + 'mo';
  return days + 'd';
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function tierFor(v) {
  if (v >= 250e6) return ['APEX', 'tier-apex'];
  if (v >= 100e6) return ['HEAVY', 'tier-heavy'];
  if (v >= 25e6) return ['RISING', 'tier-rising'];
  if (v >= 5e6) return ['EARLY', 'tier-early'];
  return ['SEED', 'tier-seed'];
}
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  return {
    q: h.get('q') || '',
    cat: h.get('cat') || '',
    chain: h.get('chain') || '',
    wl: h.get('wl') === '1',
    sort: h.get('sort') || 'rank',
    dir: h.get('dir') || 'asc',
    tab: h.get('tab') || 'board',
    p: h.get('p') || '',
  };
}
let state = readHash();
function writeHash() {
  const h = new URLSearchParams();
  if (state.q) h.set('q', state.q);
  if (state.cat) h.set('cat', state.cat);
  if (state.chain) h.set('chain', state.chain);
  if (state.wl) h.set('wl', '1');
  if (state.sort !== 'rank') h.set('sort', state.sort);
  if (state.dir !== 'asc') h.set('dir', state.dir);
  if (state.tab !== 'board') h.set('tab', state.tab);
  if (state.p) h.set('p', state.p);
  const s = h.toString();
  history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
}

function visibleRows() {
  const q = state.q.trim().toLowerCase();
  let rows = D.rows.filter((r) => {
    if (state.wl && !r.watchlist) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q))) return false;
    return true;
  });
  const key = state.sort;
  const dir = state.dir === 'desc' ? -1 : 1;
  const tierOrder = { APEX: 0, HEAVY: 1, RISING: 2, EARLY: 3, SEED: 4 };
  rows = rows.slice().sort((a, b) => {
    if (key === 'tier') return (tierOrder[tierFor(a.implied_value_usd)[0]] - tierOrder[tierFor(b.implied_value_usd)[0]]) * dir;
    const av = a[key];
    const bv = b[key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
  return rows;
}

function renderStats() {
  const vals = D.rows.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  const total = vals.reduce((n, v) => n + v, 0);
  const cats = {};
  D.rows.forEach((r) => { cats[r.category || '—'] = (cats[r.category || '—'] || 0) + 1; });
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  $('stats').innerHTML = [
    ['<b class="gold">' + D.rows.length + '</b>', 'protocols ranked'],
    ['<b class="gold">' + D.meta.watchlist + ' / ' + D.meta.watchlist + '</b>', 'watchlist covered'],
    ['<b>' + money(median) + '</b>', 'median implied value'],
    ['<b>' + money(total) + '</b>', 'combined implied value'],
  ].map(([b, s]) => '<div class="stat">' + b + '<span>' + s + '</span></div>').join('');
  $('asof').textContent = D.meta.as_of;
  $('asof2').textContent = D.meta.as_of;
  $('modelver').textContent = D.meta.model;
  const top = D.rows[0];
  const [tier, tierCls] = tierFor(top.implied_value_usd);
  $('hero').innerHTML =
    '<div class="hero-card"><div class="hero-left"><span class="hero-rank">#1 &middot; ' + esc(top.category || '—') + '</span>' +
    '<h2>' + esc(top.name) + '</h2>' +
    '<p>' + money(top.tvl_usd) + ' TVL across ' + top.chains.length + ' chain' + (top.chains.length === 1 ? '' : 's') + ', ' + ageLabel(top.age_days) + ' tracked, 7d ' + pct(top.change_7d) + '. The single most valuable launch candidate in the snapshot.</p>' +
    '<p><span class="tier ' + tierCls + '">' + tier + '</span> <button type="button" class="hero-cta" data-slug="' + esc(top.slug) + '">See the farm plan &rarr;</button></p></div>' +
    '<div class="hero-right"><span class="hero-label">Implied value</span><span class="hero-value">' + money(top.implied_value_usd) + '</span>' +
    '<span class="hero-math">' + money(top.tvl_usd) + ' &times; ' + top.multiple.toFixed(2) + ' &times; ' + top.growth.toFixed(2) + ' &times; ' + top.maturity.toFixed(2) + ' &times; ' + top.breadth.toFixed(2) + '</span></div></div>';
  const heroBtn = document.querySelector('.hero-cta');
  if (heroBtn) heroBtn.addEventListener('click', () => openDetail(heroBtn.dataset.slug));
  const top10 = D.rows.slice(0, 10);
  const max = top10[0].implied_value_usd;
  $('topbars').innerHTML = top10.map((r) => (
    '<div class="bar-row"><span class="bar-name">' + r.rank + '. ' + esc(r.name) + '</span>' +
    '<span class="bar-track"><span class="bar-fill" style="display:block;width:' + Math.max(2, Math.round(r.implied_value_usd / max * 100)) + '%"></span></span>' +
    '<span class="bar-val">' + money(r.implied_value_usd) + '</span></div>'
  )).join('');
}

function renderControls() {
  const cats = [...new Set(D.rows.map((r) => r.category || '—'))].sort();
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  const catSel = $('cat');
  const chainSel = $('chain');
  if (catSel.options.length <= 1) {
    cats.forEach((c) => catSel.add(new Option(c, c === '—' ? '' : c)));
    chains.forEach((c) => chainSel.add(new Option(c, c)));
  }
  $('q').value = state.q;
  catSel.value = state.cat;
  chainSel.value = state.chain;
  $('wl').checked = state.wl;
}

function renderBoard() {
  const rows = visibleRows();
  const maxImplied = D.rows[0].implied_value_usd;
  $('count').textContent = rows.length + ' of ' + D.rows.length + ' protocols shown';
  $('rows').innerHTML = rows.map((r) => {
    const [tier, tierCls] = tierFor(r.implied_value_usd);
    const medal = r.rank === 1 ? 'medal-gold' : r.rank === 2 ? 'medal-silver' : r.rank === 3 ? 'medal-bronze' : '';
    return '<tr data-slug="' + esc(r.slug) + '">' +
    '<td class="num"><span class="rank-num ' + medal + '">' + r.rank + '</span></td>' +
    '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + (r.watchlist ? ' · <span class="wl">Watchlist</span>' : '') + '</span></td>' +
    '<td><span class="tier ' + tierCls + '">' + tier + '</span></td>' +
    '<td>' + esc(r.category || '—') + '</td>' +
    '<td class="num">' + money(r.tvl_usd) + '</td>' +
    '<td class="num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</td>' +
    '<td class="num">' + ageLabel(r.age_days) + '</td>' +
    '<td class="num implied"><span>' + money(r.implied_value_usd) + '</span><span class="valbar"><span style="display:block;width:' + Math.max(2, Math.round(r.implied_value_usd / maxImplied * 100)) + '%"></span></span></td></tr>';
  }).join('');
  document.querySelectorAll('#board thead th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === state.sort);
    th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.dataset.sort === state.sort ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '');
  });
  document.querySelectorAll('#rows tr').forEach((tr) => {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug));
  });
}

function renderLive() {
  $('liverows').innerHTML = D.live.map((r) => (
    '<tr><td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + '</span></td>' +
    '<td>' + esc(r.category || '—') + '</td>' +
    '<td class="num">' + money(r.tvl_usd) + '</td>' +
    '<td class="num">' + money(r.mcap_usd) + '</td>' +
    '<td class="num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</td></tr>'
  )).join('');
}

function renderCoverage() {
  const c = D.coverage;
  $('coverage').innerHTML =
    '<b>' + c.rows + ' rows</b> — all ' + c.watchlist + ' watchlist protocols, plus ' + c.above_floor_added +
    ' rankable protocols at or above the $50M floor the watchlist leaves out and ' + c.below_floor +
    ' below it. The floor is a floor, never a ceiling: the watchlist is not the whole board.';
}

function renderCalibration() {
  const cal = D.calibration;
  const bt = cal.backtest;
  const rows = cal.table
    .filter((t) => D.rows.some((r) => (r.category || '(no category)') === t.category))
    .sort((a, b) => b.multiple - a.multiple);
  $('calibration').innerHTML =
    '<p>Each category multiple is calibrated from the snapshot\u2019s own live-token protocols — the median market-cap-to-TVL ratio of the category\u2019s live peers. ' +
    'Five or more peers: the raw median. Two to four peers: shrunk toward the global median (' + cal.global_median.toFixed(3) + ' over ' + cal.global_n + ' live peers in board-eligible categories, pseudo-count ' + cal.shrink_k + '). ' +
    'One peer or none: the v1 hand-set multiple — a single observation is not a distribution (the lone Prediction Market peer trades at 400&times; its TVL). No multiple is credited above ' + cal.multiple_cap.toFixed(2) + '.</p>' +
    '<div class="tablewrap model-table"><table><thead><tr><th>Category</th><th>Live peers</th><th>Peer median</th><th>Method</th><th>Multiple used</th></tr></thead><tbody>' +
    rows.map((t) => '<tr><td>' + esc(t.category) + '</td><td class="num">' + t.peers + '</td><td class="num">' + (t.raw_median === null ? '—' : t.raw_median.toFixed(3)) + '</td><td>' + esc(t.method) + '</td><td class="num"><b>' + t.multiple.toFixed(3) + '</b></td></tr>').join('') +
    '</tbody></table></div>' +
    '<p><strong>Backtest.</strong> Leave-one-out on the ' + bt.n + ' live-token protocols with a positive market cap (' + bt.excluded_zero_mcap + ' record a $0 market cap and carry no price signal, so they are excluded): predict each token\u2019s market cap as TVL &times; multiple, calibrating from every peer except the protocol itself. ' +
    'Median absolute error: <b>' + (bt.v2_median_ape * 100).toFixed(0) + '%</b> for the calibrated multiples vs <b>' + (bt.v1_median_ape * 100).toFixed(0) + '%</b> for the v1 hand-set multiples; median |ln(pred / actual)| ' + bt.v2_median_log_err.toFixed(2) + ' vs ' + bt.v1_median_log_err.toFixed(2) + '. ' +
    'The calibration does not win the backtest — live token values scatter roughly tenfold around any TVL multiple, so no single multiple per category predicts them closely. What it does is remove the systematic bias: v1 priced Lending at 0.34 when lending tokens trade at a 0.132 median, and Basis Trading at 0.26 when its peers trade at 0.654. The multiples now follow the snapshot\u2019s own figures instead of a hand-set guess.</p>';
}

function renderModel() {
  const m = D.model;
  const onBoard = new Set(D.rows.map((r) => r.category || '(no category)'));
  const mults = Object.entries(m.multiples).filter(([c]) => onBoard.has(c === '' ? '(no category)' : c)).sort((a, b) => b[1] - a[1]);
  const rows = mults.map(([c, v]) => '<tr><td>' + esc(c === '' ? '(no category)' : c) + '</td><td class="num">' + v.toFixed(2) + '</td></tr>').join('') +
    '<tr><td>Any other category</td><td class="num">' + m.default_multiple.toFixed(2) + '</td></tr>';
  $('modeldoc').innerHTML =
    '<p><strong>Formula:</strong> ' + esc(m.formula) + '</p>' +
    '<div class="tablewrap model-table"><table><thead><tr><th>Category</th><th>Multiple of TVL</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p><strong>Growth:</strong> 1 + clamp(7-day change, −' + Math.abs(m.growth_lo) + '%, +' + m.growth_hi + '%) &divide; 100 &times; ' + m.growth_weight + '. A protocol growing 10% in a week is worth 6% more; no figure reported counts as 0%.</p>' +
    '<p><strong>Maturity:</strong> 0.55 + 0.45 &times; min(age, ' + m.maturity_days + ' days) &divide; ' + m.maturity_days + '. Three years tracked earns the full weight; a week-old protocol earns barely half. No listing date reported counts as ' + m.unknown_age_days + ' days.</p>' +
    '<p><strong>Breadth:</strong> 1 + 0.03 &times; min(chains − 1, 4). Each extra chain, up to four, adds 3% — multi-chain reach is real distribution.</p>' +
    '<p><strong>Tiers:</strong> the board labels each protocol by its implied value — APEX at $250M and above, HEAVY at $100M, RISING at $25M, EARLY at $5M, SEED below that. A tier is a label, not a separate score; the rank is always the implied value itself.</p>';
  const top = D.rows[0];
  $('worked').innerHTML =
    '<p><strong>' + esc(top.name) + '</strong> — TVL ' + money(top.tvl_usd) + ', ' + esc(top.category || '—') + ', ' + top.chains.length + ' chain' + (top.chains.length === 1 ? '' : 's') + ', ' + ageLabel(top.age_days) + ' old, 7d ' + pct(top.change_7d) + '.</p>' +
    '<div class="math">' + money(top.tvl_usd) + ' &times; ' + top.multiple.toFixed(2) + ' &times; ' + top.growth.toFixed(3) + ' &times; ' + top.maturity.toFixed(3) + ' &times; ' + top.breadth.toFixed(2) + ' = <b>' + money(top.implied_value_usd) + '</b></div>';
}

function openDetail(slug) {
  const r = D.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.p = slug;
  writeHash();
  const [tier, tierCls] = tierFor(r.implied_value_usd);
  $('detailbody').innerHTML =
    '<div class="detail-body"><h2>' + esc(r.name) + '</h2>' +
    '<p class="sub">Rank ' + r.rank + ' &middot; ' + esc(r.category || '—') + ' &middot; ' + (r.watchlist ? 'on the watchlist &middot; ' : '') + 'records no token</p>' +
    '<p><span class="tier ' + tierCls + '">' + tier + '</span> <span class="detail-value">' + money(r.implied_value_usd) + '</span></p>' +
    '<p>' + r.chains.map((c) => '<span class="chip">' + esc(c) + '</span>').join('') + '</p>' +
    '<h3>Why it is worth ' + money(r.implied_value_usd) + '</h3>' +
    '<div class="math">' + money(r.tvl_usd) + ' TVL &times; ' + r.multiple.toFixed(2) + ' category &times; ' + r.growth.toFixed(3) + ' growth &times; ' + r.maturity.toFixed(3) + ' maturity &times; ' + r.breadth.toFixed(2) + ' breadth = <b>' + money(r.implied_value_usd) + '</b></div>' +
    '<p class="note">Growth uses the 7-day change (' + pct(r.change_7d) + '); maturity uses ' + r.age_days + ' days tracked; breadth uses ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '. "Records no token" is what the snapshot says — not proof the protocol has none.</p>' +
    (r.siblings.length || r.brand_live.length || r.brand_token.length ? '<p class="note sib">' +
      (r.siblings.length ? 'Same brand, also on this board: ' + r.siblings.map((s) => esc(nameOf(s))).join(', ') + '. Each row carries only its own protocol\u2019s TVL — no TVL is counted twice. ' : '') +
      (r.brand_live.length ? 'This brand already has a live-token protocol: ' + r.brand_live.map((s) => esc(nameOf(s))).join(', ') + '. ' : '') +
      (r.brand_token.length ? 'A same-brand protocol records a token symbol (no market cap): ' + r.brand_token.map((s) => esc(nameOf(s))).join(', ') + '. ' : '') +
      '</p>' : '') +
    '<h3>Farm plan</h3>' +
    '<ol class="steps">' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
    '</div>';
  const dlg = $('detail');
  if (!dlg.open) dlg.showModal();
}

function closeDetail() {
  state.p = '';
  writeHash();
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('view-board').hidden = state.tab !== 'board';
  $('view-live').hidden = state.tab !== 'live';
  $('view-model').hidden = state.tab !== 'model';
}

function nameOf(slug) {
  const r = D.rows.find((x) => x.slug === slug);
  if (r) return r.name;
  const l = D.live.find((x) => x.slug === slug);
  return l ? l.name : slug;
}

function render() {
  renderStats();
  renderControls();
  renderBoard();
  renderLive();
  renderModel();
  renderCalibration();
  renderCoverage();
  renderTabs();
}

$('q').addEventListener('input', (e) => { state.q = e.target.value; writeHash(); renderBoard(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; writeHash(); renderBoard(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; writeHash(); renderBoard(); });
$('wl').addEventListener('change', (e) => { state.wl = e.target.checked; writeHash(); renderBoard(); });
document.querySelectorAll('#board thead th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    if (state.sort === th.dataset.sort) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.sort = th.dataset.sort; state.dir = th.dataset.sort === 'name' || th.dataset.sort === 'category' || th.dataset.sort === 'tier' ? 'asc' : 'desc'; }
    writeHash();
    renderBoard();
  });
});
document.querySelectorAll('.tab').forEach((b) => {
  b.addEventListener('click', () => { state.tab = b.dataset.tab; writeHash(); renderTabs(); });
});
$('detail').addEventListener('close', closeDetail);
window.addEventListener('hashchange', () => {
  state = readHash();
  render();
  if (state.p) openDetail(state.p);
  else if ($('detail').open) $('detail').close();
});

render();
if (state.p) openDetail(state.p);
