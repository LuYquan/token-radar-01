// Token Radar radar-2 dashboard. Reads window.RADAR (written beside this page
// by main.ts), renders the ranked board, a filterable table, a per-protocol
// detail drawer, a live-token view and the model section. No network: every
// byte it shows is in data.js. Farm plans are rendered from board.json's own
// farm_steps, never regenerated here, so the page and the board cannot drift.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, minImplied: 0, sort: 'implied', dir: -1, tab: 'board', page: 1, selected: null };
  var PAGE = 20;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // impliedOf recomputes a row from the snapshot figures and the stored model
  // factors, so the drawer can check itself against board.json's number.
  function impliedOf(r, growthWeight) {
    var g = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var gm = 1 + (g / 100) * (growthWeight === undefined ? DATA.model.growth_weight : growthWeight);
    var age = r.age_days === null ? DATA.model.unknown_age_days : r.age_days;
    var mm = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    var bm = 1 + DATA.model.breadth_weight * Math.log(Math.max(1, (r.chains || []).length));
    return Math.max(1, Math.round(r.tvl_usd * r.comp_multiple * gm * mm * bm));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('watch') === '1') state.watchOnly = true;
    if (p.get('page')) state.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.tab !== 'board') p.set('tab', state.tab);
    if (state.watchOnly) p.set('watch', '1');
    if (state.page > 1) p.set('page', String(state.page));
    if (state.selected) p.set('p', state.selected);
    var n = p.toString();
    window.history.replaceState(null, '', n ? '#' + n : window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.implied_value_usd < state.minImplied) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (state.sort === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (state.sort === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'pill', text: 'DefiLlama protocol index' }),
        el('span', { class: 'pill', text: DATA.model_version + ' model' })));
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { html: 'Every protocol in the snapshot that records <b>no token</b> and is not a wrapped, staked or bridged product of one that trades, ranked by what its token would be worth if the protocol’s record stayed as it is. Implied value is a model, not a price and not a promise that a token launches.' })),
      el('div', null, el('p', { class: 'note', text: 'Say it precisely: a protocol records no token. DefiLlama’s record is not proof it has none.' })));
  }

  function kpis() {
    var farm = DATA.rows.filter(function (r) { return r.verdict === 'FARM'; }).length;
    var thin = DATA.rows.filter(function (r) { return r.verdict === 'THIN'; }).length;
    function kpi(label, value, note) { return el('div', { class: 'kpi' }, el('span', { text: label }), el('b', { text: value }), el('em', { text: note })); }
    return el('section', { class: 'kpis' },
      kpi('Total implied value', fmtUsd(DATA.total_implied_usd), 'across ' + DATA.board_size + ' rows'),
      kpi('Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'floor $' + Math.round(DATA.floor_usd / 1e6) + 'M TVL, no token'),
      kpi('Rows on the board', String(DATA.board_size), DATA.early_size + ' early, below the floor'),
      kpi('Median implied value', fmtUsd(DATA.median_implied_usd), 'half the board is below this'),
      kpi('Farm verdicts', farm + ' FARM', thin + ' THIN · ' + (DATA.board_size - farm - thin) + ' SKIP — watch, don’t farm'));
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 3);
    return el('section', { class: 'spot' }, top.map(function (r) {
      return el('article', { class: 'card' },
        el('span', { class: 'rank', text: 'RANK ' + r.rank + ' · ' + (r.watchlist ? 'WATCHLIST' : 'EARLY') }),
        el('h3', { text: r.name }),
        el('div', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains || []).slice(0, 2).join(', ') }),
        el('div', { class: 'big', text: fmtUsd(r.implied_value_usd) + ' implied' }),
        el('div', { class: 'meta' }, el('span', { text: 'TVL ' + fmtUsd(r.tvl_usd) }), el('span', { text: '7d ' + fmtPct(r.change_7d) }), el('span', { text: 'Age ' + fmtAge(r.age_days) })),
        el('div', { class: 'meta' }, el('span', { text: 'Verdict: ' + r.verdict + ' · gas ~$' + r.farm_cost_usd })));
    }));
  }

  function funnel() {
    var f = DATA.funnel;
    return el('section', { class: 'funnel' },
      el('span', { html: '<b>' + f.snapshot + '</b> protocols in the snapshot' }), el('span', { class: 'arrow', text: '→' }),
      el('span', { html: '<b>' + f.pre_token + '</b> record no token' }), el('span', { class: 'arrow', text: '→' }),
      el('span', { html: '<b>' + f.board + '</b> launch candidates on the board' }), el('span', { class: 'arrow', text: '→' }),
      el('span', { html: '<b>' + f.excluded + '</b> set aside (' + DATA.excluded_reasons.map(function (x) { return x.reason + ' ' + x.count; }).join(', ') + ')' }), el('span', { class: 'arrow', text: '→' }),
      el('span', { html: '<b>' + f.live + '</b> already trade, shown separately' }));
  }

  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.page = 1; writeHash(); render(); });
    function opt(v, t, sel) { return el('option', { value: v, text: t, selected: sel ? 'selected' : null }); }
    var catSel = el('select', { 'aria-label': 'Filter by category' }, opt('all', 'All categories', state.category === 'all'), cats.map(function (c) { return opt(c, c, state.category === c); }));
    catSel.addEventListener('change', function () { state.category = catSel.value; state.page = 1; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' }, opt('all', 'All chains', state.chain === 'all'), chains.map(function (c) { return opt(c, c, state.chain === c); }));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; state.page = 1; writeHash(); render(); });
    var minSel = el('select', { 'aria-label': 'Minimum implied value' },
      opt('0', 'Any implied value', state.minImplied === 0), opt('5000000', '≥ $5M implied', state.minImplied === 5000000),
      opt('25000000', '≥ $25M implied', state.minImplied === 25000000), opt('50000000', '≥ $50M implied', state.minImplied === 50000000));
    minSel.addEventListener('change', function () { state.minImplied = parseInt(minSel.value, 10); state.page = 1; writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', checked: state.watchOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; state.page = 1; writeHash(); render(); });
    function tabBtn(tab, label) { return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; state.page = 1; writeHash(); render(); } }); }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { text: 'Implied value' }), minSel),
      el('label', { class: 'check' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('board', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('model', 'Model'))),
      el('span', { class: 'count', text: state.tab === 'board' ? filtered().length + ' of ' + DATA.board_size + ' rows' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : 'how every number is made' }));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }

  function verdictChip(v) { return el('span', { class: 'chip ' + v.toLowerCase(), text: v }); }

  function boardTable() {
    var list = sorted(filtered());
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (state.page > pages) state.page = pages;
    var slice = list.slice((state.page - 1) * PAGE, state.page * PAGE);
    if (list.length === 0) return el('div', { class: 'panel' }, el('div', { class: 'empty' }, el('h2', { text: 'No protocol matches that filter' }), el('p', { text: 'Clear the search or pick another category to see the board again.' }), el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.minImplied = 0; state.page = 1; writeHash(); render(); } })));
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    slice.forEach(function (r) {
      var tr = el('tr', { 'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('span', { html: '<b>' + esc(r.name) + '</b><span class="badge' + (r.watchlist ? ' w' : '') + '">' + (r.watchlist ? 'WATCHLIST' : 'EARLY') + '</span>' }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains || []).slice(0, 2).join(', ') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' }, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, verdictChip(r.verdict)));
      tbody.appendChild(tr);
    });
    var pager = el('div', { class: 'pager' },
      el('button', { type: 'button', disabled: state.page <= 1 ? 'disabled' : null, text: '← Prev', onclick: function () { if (state.page > 1) { state.page--; writeHash(); render(); } } }),
      el('span', { text: 'Page ' + state.page + ' of ' + pages + ' · showing ' + slice.length + ' of ' + list.length + ' rows' }),
      el('span', { class: 'sp' }),
      el('button', { type: 'button', disabled: state.page >= pages ? 'disabled' : null, text: 'Next →', onclick: function () { if (state.page < pages) { state.page++; writeHash(); render(); } } }));
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null, el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
        el('thead', null, el('tr', null, sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Verdict' }))), tbody)), pager);
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains || []).slice(0, 2).join(', ') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'chip skip', text: 'ALREADY TRADES' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null, el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comparables that price it.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))), tbody)));
  }

  function categoryBars() {
    var totals = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; totals[c] = (totals[c] || 0) + r.implied_value_usd; });
    var top = Object.keys(totals).map(function (c) { return { c: c, v: totals[c] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    var max = top[0] ? top[0].v : 1;
    return el('section', { class: 'panel box' }, el('h2', { text: 'Where the implied value sits' }),
      el('p', { text: 'Combined implied value by category. Risk Curators dominate because the biggest pre-token vaults sit there — the model prices them off the same comparables as everything else.' }),
      top.map(function (t) { return el('div', { class: 'catbar' }, el('span', { text: t.c }), el('div', { class: 'track' }, el('i', { style: 'width:' + Math.max(2, Math.round((t.v / max) * 100)) + '%' })), el('span', { text: fmtUsd(t.v) })); }));
  }

  function modelSection() {
    var m = DATA.model;
    var compRows = DATA.comps.filter(function (c) { return c.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
    var tbody = el('tbody');
    compRows.forEach(function (c) { tbody.appendChild(el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: String(c.n) }), el('td', { class: 'num', text: c.median === null ? '—' : c.median.toFixed(3) }), el('td', { class: 'num', text: c.multiple.toFixed(3) }))); });
    var growthIn = el('input', { type: 'range', min: '-50', max: '100', step: '5', value: '0', 'aria-label': 'Assumed seven-day growth, per cent' });
    var pick = el('select', { 'aria-label': 'Protocol to test' }, DATA.rows.slice(0, 12).map(function (r) { return el('option', { value: r.slug, text: '#' + r.rank + ' ' + r.name }); }));
    var out = el('output', { text: '' });
    function recompute() {
      var r = DATA.rows.filter(function (x) { return x.slug === pick.value; })[0];
      var g = parseInt(growthIn.value, 10);
      var saved = r.change_7d;
      r.change_7d = g;
      var v = impliedOf(r, undefined);
      r.change_7d = saved;
      out.textContent = 'At ' + (g > 0 ? '+' : '') + g + '% growth, ' + r.name + ' would be ' + fmtUsd(v) + ' (board: ' + fmtUsd(r.implied_value_usd) + '). What-if only — board.json is unchanged.';
    }
    growthIn.addEventListener('input', recompute);
    pick.addEventListener('change', recompute);
    recompute();
    return el('div', { class: 'grid2' },
      el('section', { class: 'panel box' }, el('h2', { text: 'How implied value is computed' }),
        el('p', { text: 'One function scores every row, from the snapshot’s own figures. No protocol name is special-cased.' }),
        el('div', { class: 'formula', html: 'implied = round( tvl_usd × <b>comp multiple</b> × growth × maturity × breadth )<br>comp multiple = category median mcap/TVL, shrunk toward the global median ' + DATA.global_comp_median.toFixed(3) + ' (weight n/(n+8)), clamped [0.05, 2.0]<br>growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '<br>maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ' (unknown age: ' + m.unknown_age_days + 'd)<br>breadth = 1 + ' + m.breadth_weight + ' × ln(chains)' }),
        el('p', { text: 'Calibration is in-sample: the multiples come from the live-token protocols in this same snapshot. It is a pricing rule, not a backtest — no future data exists to test it on.' }),
        el('div', { class: 'sandbox' }, el('h3', { text: 'What-if sandbox' }),
          el('div', { class: 'row' }, pick, growthIn),
          el('p', { class: 'note' }, out))),
      el('section', { class: 'panel box' }, el('h2', { text: 'Comparables by category' }),
        el('p', { text: 'Live-token protocols in the snapshot, per category: how many, their median market-cap-to-TVL, and the multiple the model actually uses after shrinkage. Categories with no live comp use the global median.' }),
        el('div', { class: 'table-wrap' }, el('table', { class: 'cal' }, el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Comps' }), el('th', { scope: 'col', text: 'Median mcap/TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))), tbody))));
  }

  var scrim = el('div', { class: 'scrim', hidden: 'hidden', onclick: function () { closeDetail(); } });
  var drawer = el('aside', { class: 'drawer', hidden: 'hidden', 'aria-label': 'Protocol detail' });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    drawer.textContent = '';
    var recomputed = impliedOf(row, undefined);
    drawer.appendChild(el('div', { class: 'd-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.watchlist ? 'WATCHLIST' : 'EARLY') }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains || []).join(', ') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { closeDetail(); } })));
    drawer.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Comparables multiple' }), el('b', { class: 'num', text: String(row.comp_multiple) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', { class: 'tot' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board — the data would be stale.') + ' This is an estimate, not a price.' }),
      el('p', { class: 'warn', text: 'Verdict: ' + row.verdict + ' — gas for the plan below is about $' + row.farm_cost_usd + '. Never pay to claim an airdrop; a real claim costs gas only.' })));
    drawer.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: 'Farm plan — 7 steps, costed' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))));
    drawer.removeAttribute('hidden');
    scrim.removeAttribute('hidden');
  }
  function closeDetail() { state.selected = null; writeHash(); drawer.setAttribute('hidden', 'hidden'); scrim.setAttribute('hidden', 'hidden'); render(); }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(kpis());
    shell.appendChild(controls());
    if (state.tab === 'board') { shell.appendChild(boardTable()); shell.appendChild(spotlight()); shell.appendChild(funnel()); shell.appendChild(categoryBars()); }
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(modelSection());
    shell.appendChild(el('footer', { class: 'panel foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '. The board is built by one program from that snapshot; re-running it on the same bytes gives the same board.' }),
      el('p', { text: 'Limits, stated plainly: implied value assumes the protocol’s record stays as it is; it does not predict whether or when a token launches. Farm plans assume the protocol’s own points or rewards page is the only place to claim. A protocol that records no token may still have one its DefiLlama record does not carry.' })));
    app.appendChild(shell);
    app.appendChild(scrim);
    app.appendChild(drawer);
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hasAttribute('hidden')) closeDetail(); });
})();
