/* Prism — the console.
 * Holds the one piece of state everything reads from, wires the panels to it,
 * and re-renders the stage whenever it changes.
 */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var d3 = window.d3;
  var U = CB.util;
  var el = U.el;

  /* Which encoding slots each form exposes, so the builder controls and the
   * "swap the chart type" list are generated rather than hand-maintained. */
  var SPEC = {
    line:       { slots: [s('x', 'X axis', ['temporal', 'nominal', 'quantitative']), s('y', 'Measure', ['quantitative'], { count: true }), s('color', 'Split by', ['nominal', 'boolean'], { optional: true })], agg: true },
    area:       { slots: [s('x', 'X axis', ['temporal', 'nominal']), s('y', 'Measure', ['quantitative'], { count: true }), s('color', 'Stack by', ['nominal', 'boolean'])], agg: true },
    bar:        { slots: [s('x', 'Category', ['nominal', 'boolean']), s('y', 'Measure', ['quantitative'], { count: true })], agg: true },
    groupedBar: { slots: [s('x', 'Category', ['nominal', 'boolean']), s('color', 'Grouped by', ['nominal', 'boolean']), s('y', 'Measure', ['quantitative'], { count: true })], agg: true },
    stackedBar: { slots: [s('x', 'Category', ['nominal', 'boolean']), s('color', 'Stacked by', ['nominal', 'boolean']), s('y', 'Measure', ['quantitative'], { count: true })], agg: true },
    histogram:  { slots: [s('y', 'Measure', ['quantitative'])] },
    scatter:    { slots: [s('x', 'X measure', ['quantitative']), s('y', 'Y measure', ['quantitative']), s('color', 'Colour by', ['nominal', 'boolean'], { optional: true }), s('size', 'Size by', ['quantitative'], { optional: true })] },
    corrMatrix: { multi: { key: 'measures', label: 'Measures', accept: ['quantitative'], min: 3, max: 10 } },
    heatmap:    { slots: [s('row', 'Rows', ['nominal', 'boolean']), s('col', 'Columns', ['nominal', 'boolean']), s('y', 'Measure', ['quantitative'], { count: true })], agg: true },
    calendar:   { slots: [s('x', 'Date', ['temporal']), s('y', 'Measure', ['quantitative'], { count: true })], agg: true },
    treemap:    { levels: true, slots: [s('y', 'Measure', ['quantitative'], { count: true })], agg: true },
    parallel:   { multi: { key: 'measures', label: 'Measures', accept: ['quantitative'], min: 3, max: 7 }, slots: [s('color', 'Colour by', ['nominal', 'boolean'], { optional: true })] },
    radial:     { slots: [s('x', 'Cycle', ['nominal', 'boolean']), s('y', 'Measure', ['quantitative'], { count: true })], agg: true },
    ridgeline:  { slots: [s('y', 'Measure', ['quantitative']), s('color', 'Grouped by', ['nominal', 'boolean'])] },
    beeswarm:   { slots: [s('y', 'Measure', ['quantitative']), s('color', 'Grouped by', ['nominal', 'boolean'])] },
    slope:      { slots: [s('x', 'Date', ['temporal']), s('color', 'Series', ['nominal', 'boolean']), s('y', 'Measure', ['quantitative'], { count: true })], agg: true },
    dumbbell:   { slots: [s('x', 'Category', ['nominal', 'boolean']), s('y', 'First measure', ['quantitative']), s('y2', 'Second measure', ['quantitative'])], agg: true }
  };

  function s(key, label, accept, opts) {
    return Object.assign({ key: key, label: label, accept: accept }, opts || {});
  }

  var state = {
    dataset: null, profile: null, plan: null,
    active: null, hidden: new Set(),
    agg: null, tableOpen: false,
    filters: { time: 'all', dimField: null, excluded: new Set() },
    busy: false, error: null
  };

  var dom = {};

  /* ================= boot ============================================= */

  function boot() {
    dom.root = document.getElementById('app');
    U.clear(dom.root);
    dom.root.appendChild(header());
    var main = el('main', { class: 'console' });
    dom.left = el('aside', { class: 'rail rail--left', 'aria-label': 'Data source and columns' });
    dom.stage = el('section', { class: 'stage', 'aria-label': 'Chart' });
    dom.right = el('aside', { class: 'rail rail--right', 'aria-label': 'Chart controls' });
    main.appendChild(dom.left); main.appendChild(dom.stage); main.appendChild(dom.right);
    dom.root.appendChild(main);

    wireDropTarget(document.body);
    wireTheme();

    load(function () { return CB.ingest.fromSample('storefront'); });

    var redraw = U.debounce(function () { if (state.plan) renderStage(); }, 180);
    window.addEventListener('resize', redraw);
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', redraw);
  }

  /* ================= header =========================================== */

  function header() {
    var h = el('header', { class: 'bar' });
    h.appendChild(el('div', { class: 'brand' }, [
      el('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
      el('span', { class: 'brand-name', text: 'Prism' }),
      el('span', { class: 'brand-tag', text: 'bring data, get the view it deserves' })
    ]));
    dom.meta = el('div', { class: 'bar-meta' });
    h.appendChild(dom.meta);
    h.appendChild(el('div', { class: 'bar-actions' }, [
      button('Copy SVG', 'ghost', copySVG),
      button('Save chart', 'ghost', function () { saveChart('svg'); }),
      button('Save PNG', 'ghost', function () { saveChart('png'); }),
      themeButton()
    ]));
    return h;
  }

  function button(label, kind, onClick, attrs) {
    return el('button', Object.assign({
      class: 'btn btn--' + kind, type: 'button', text: label, onclick: onClick
    }, attrs || {}));
  }

  var THEMES = ['system', 'light', 'dark'];
  function wireTheme() {
    var saved = null;
    try { saved = localStorage.getItem('prism-theme'); } catch (e) { /* private mode */ }
    applyTheme(THEMES.indexOf(saved) >= 0 ? saved : 'system');
  }
  function applyTheme(t) {
    state.theme = t;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('prism-theme', t); } catch (e) { /* fine */ }
    if (dom.themeBtn) dom.themeBtn.textContent = t === 'system' ? 'Theme: auto' : t === 'light' ? 'Theme: light' : 'Theme: dark';
    if (state.plan) renderStage();
  }
  function themeButton() {
    dom.themeBtn = button('Theme: auto', 'ghost', function () {
      applyTheme(THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]);
    }, { title: 'Switch between automatic, light and dark' });
    return dom.themeBtn;
  }

  /* ================= loading ========================================== */

  function load(producer) {
    state.busy = true; state.error = null;
    renderLeft();
    Promise.resolve().then(producer).then(function (res) {
      if (!res.rows.length) throw new Error('That source parsed cleanly but has no rows in it.');
      var profile = CB.profile.run(res.rows);
      var plan = CB.recommend.build(profile);
      if (!plan.candidates.length) {
        throw new Error('Every column read as free text or an identifier, so there is nothing to plot. ' +
          'Check that numbers and dates are not wrapped in quotes or footnote markers.');
      }
      state.dataset = res;
      state.profile = profile;
      state.plan = plan;
      state.active = plan.candidates[0];
      state.agg = state.active.enc.agg || null;
      state.hidden = new Set();
      state.filters = { time: 'all', dimField: null, excluded: new Set() };
      state.tableOpen = false;
      state.busy = false;
      renderAll();
    }).catch(function (e) {
      state.busy = false;
      state.error = e && e.message ? e.message : String(e);
      renderLeft();
      if (!state.plan) {
        U.clear(dom.stage);
        dom.stage.appendChild(el('div', { class: 'stage-empty' }, [
          el('h2', { text: 'That did not load' }),
          el('p', { text: state.error })
        ]));
      }
    });
  }

  function renderAll() { renderMeta(); renderLeft(); renderRight(); renderStage(); }

  function renderMeta() {
    U.clear(dom.meta);
    if (!state.profile) return;
    var p = state.profile;
    var plotted = filtered().length;
    dom.meta.appendChild(el('span', { class: 'meta-name', text: state.dataset.name }));
    dom.meta.appendChild(el('span', {
      class: 'meta-count',
      text: U.precise(plotted) + (plotted === p.rowCount ? '' : ' of ' + U.precise(p.rowCount)) +
        ' rows · ' + p.fields.length + ' columns' +
        (state.plan.derived.length ? ' · ' + state.plan.derived.length + ' derived' : '')
    }));
    if (state.dataset.origin === 'sample') {
      dom.meta.appendChild(el('span', { class: 'tag tag--sample', text: 'generated sample' }));
    }
  }

  /* ================= left rail: source + columns ====================== */

  function renderLeft() {
    U.clear(dom.left);

    var src = section('Source', 'Drop a file anywhere on this page.');
    var drop = el('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Choose a data file' }, [
      el('span', { class: 'drop-line', text: 'Drop a CSV, TSV or JSON file' }),
      el('span', { class: 'drop-sub', text: 'or click to choose one' })
    ]);
    var input = el('input', { type: 'file', accept: '.csv,.tsv,.txt,.json,.jsonl,.psv', class: 'visually-hidden' });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) load(function () { return CB.ingest.fromFile(input.files[0]); });
    });
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    src.appendChild(drop);
    src.appendChild(input);

    var urlWrap = el('form', { class: 'url-row' });
    var urlInput = el('input', {
      type: 'url', class: 'field', placeholder: 'https://…/data.csv',
      'aria-label': 'Data file URL'
    });
    urlWrap.appendChild(urlInput);
    urlWrap.appendChild(button('Fetch', 'solid', null, { type: 'submit' }));
    urlWrap.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = urlInput.value.trim();
      if (v) load(function () { return CB.ingest.fromURL(v); });
    });
    src.appendChild(urlWrap);

    var paste = el('details', { class: 'paste' });
    paste.appendChild(el('summary', { text: 'Paste data instead' }));
    var ta = el('textarea', { class: 'field field--area', rows: '5', placeholder: 'name,value\nAlpha,12\nBeta,30', 'aria-label': 'Paste CSV or JSON' });
    paste.appendChild(ta);
    paste.appendChild(button('Use pasted data', 'solid', function () {
      var t = ta.value.trim();
      if (!t) return;
      load(function () { return { rows: CB.ingest.parseText(t), name: 'Pasted data', origin: 'paste' }; });
    }));
    src.appendChild(paste);

    var samples = el('div', { class: 'samples' });
    samples.appendChild(el('p', { class: 'samples-head', text: 'Or start from generated sample data' }));
    CB.ingest.sampleMeta().forEach(function (m) {
      var on = state.dataset && state.dataset.origin === 'sample' && state.dataset.name === m.label;
      var b = el('button', { class: 'sample' + (on ? ' is-on' : ''), type: 'button' }, [
        el('span', { class: 'sample-name', text: m.label }),
        el('span', { class: 'sample-blurb', text: m.blurb })
      ]);
      b.addEventListener('click', function () { load(function () { return CB.ingest.fromSample(m.id); }); });
      samples.appendChild(b);
    });
    src.appendChild(samples);
    dom.left.appendChild(src);

    if (state.busy) {
      dom.left.appendChild(el('p', { class: 'notice', text: 'Reading and profiling…' }));
    }
    if (state.error) {
      dom.left.appendChild(el('p', { class: 'notice notice--bad', text: state.error }));
    }
    if (state.profile) dom.left.appendChild(fieldList());
  }

  function section(title, sub) {
    var s = el('div', { class: 'panel' });
    s.appendChild(el('h2', { class: 'panel-title', text: title }));
    if (sub) s.appendChild(el('p', { class: 'panel-sub', text: sub }));
    return s;
  }

  var TYPE_LABEL = {
    quantitative: 'num', temporal: 'date', nominal: 'cat',
    boolean: 'bool', key: 'id', constant: 'const', empty: 'empty'
  };

  function fieldList() {
    var p = state.profile;
    var wrap = section('Columns', 'Click a column to put it into the current chart.');
    var list = el('div', { class: 'fields' });
    var all = p.fields.concat(state.plan.derived);
    all.forEach(function (f) {
      var row = el('button', {
        class: 'field-row' + (usedInActive(f) ? ' is-used' : '') + (f.type === 'key' || f.type === 'constant' || f.type === 'empty' ? ' is-inert' : ''),
        type: 'button',
        title: fieldTitle(f)
      });
      var head = el('div', { class: 'field-head' }, [
        el('span', { class: 'field-name', text: f.label }),
        el('span', { class: 'chip chip--' + f.type, text: TYPE_LABEL[f.type] || f.type })
      ]);
      row.appendChild(head);
      row.appendChild(sparkline(f));
      row.appendChild(el('span', { class: 'field-stat', text: fieldStat(f) }));
      row.addEventListener('click', function () { applyField(f); });
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function fieldTitle(f) {
    var bits = [f.name, TYPE_LABEL[f.type]];
    if (f.derived) bits.push('derived from ' + f.from);
    if (f.missing) bits.push(U.precise(f.missing) + ' missing');
    return bits.join(' · ');
  }

  function fieldStat(f) {
    if (f.type === 'quantitative') {
      return U.compact(f.min) + ' – ' + U.compact(f.max) + '  ·  median ' + U.compact(f.median);
    }
    if (f.type === 'temporal') {
      var fmt = d3.utcFormat('%b %Y');
      return fmt(f.min) + ' – ' + fmt(f.max) + '  ·  by ' + f.granularity;
    }
    if (f.type === 'constant') return 'one value: ' + U.ellipsis(f.constant, 22);
    if (f.type === 'empty') return 'no values';
    if (f.type === 'key') return U.precise(f.distinct) + ' distinct — used as a label, not an axis';
    return U.precise(f.distinct) + ' categories' + (f.counts ? '  ·  top ' + U.ellipsis(f.counts[0].key, 16) : '');
  }

  /** A 34-step shape of the column: bins for numbers and dates, ranked counts
   *  for categories. It is the fastest way to see what a column actually holds. */
  function sparkline(f) {
    var pal = CB.palette.current();
    var wrap = el('span', { class: 'spark' });
    var bars = null;
    if (f.histogram) bars = f.histogram.map(function (b) { return b.n; });
    else if (f.counts) bars = f.counts.slice(0, 34).map(function (c) { return c.n; });
    if (!bars || !bars.length) return wrap;
    var max = d3.max(bars) || 1;
    var svg = d3.select(wrap).append('svg')
      .attr('viewBox', '0 0 100 22').attr('preserveAspectRatio', 'none')
      .attr('width', '100%').attr('height', 22).attr('aria-hidden', 'true');
    // The gap is a fixed share of the slot, not a fixed width: with a handful
    // of near-equal categories a hairline gap makes the row read as one solid
    // block instead of as bars.
    var w = 100 / bars.length;
    var gap = Math.max(0.45, w * 0.26);
    svg.selectAll('rect').data(bars).join('rect')
      .attr('x', function (d, i) { return i * w + gap / 2; })
      .attr('width', Math.max(0.5, w - gap))
      .attr('y', function (d) { return 22 - Math.max(1, (d / max) * 22); })
      .attr('height', function (d) { return Math.max(1, (d / max) * 22); })
      .attr('fill', f.type === 'nominal' || f.type === 'boolean' ? pal.axis : pal.categorical[0])
      .attr('opacity', 0.85);
    return wrap;
  }

  function usedInActive(f) {
    if (!state.active) return false;
    var e = state.active.enc;
    var used = [e.x, e.y, e.y2, e.color, e.size, e.row, e.col]
      .concat(e.measures || []).concat(e.levels || []);
    return used.some(function (x) { return x && x.name === f.name; });
  }

  /** Clicking a column is the fast path: put it where it fits in the chart
   *  that is already on screen, and switch form only if it cannot fit at all. */
  function applyField(f) {
    if (!state.active) return;
    var spec = SPEC[state.active.id];
    var enc = Object.assign({}, state.active.enc);
    var placed = false;

    if (spec.multi && f.type === 'quantitative') {
      var ms = (enc.measures || []).slice();
      var at = ms.map(function (m) { return m.name; }).indexOf(f.name);
      if (at >= 0) { if (ms.length > spec.multi.min) ms.splice(at, 1); }
      else if (ms.length < spec.multi.max) ms.push(f);
      else { ms.pop(); ms.push(f); }
      enc.measures = ms;
      placed = true;
    }
    if (!placed && spec.levels && (f.type === 'nominal' || f.type === 'boolean')) {
      var lv = (enc.levels || []).slice();
      var li = lv.map(function (m) { return m.name; }).indexOf(f.name);
      if (li >= 0) { if (lv.length > 1) lv.splice(li, 1); }
      else if (lv.length < 2) lv.push(f);
      else lv = [lv[0], f];
      enc.levels = lv;
      placed = true;
    }
    if (!placed) {
      var slots = (spec.slots || []).filter(function (sl) { return sl.accept.indexOf(f.type) >= 0; });
      if (slots.length) {
        var already = slots.filter(function (sl) { return enc[sl.key] && enc[sl.key].name === f.name; });
        var target = already.length ? slots[(slots.indexOf(already[0]) + 1) % slots.length]
          : (slots.filter(function (sl) { return !enc[sl.key]; })[0] || slots[0]);
        enc[target.key] = f;
        placed = true;
      }
    }
    if (!placed) {
      // Nothing in this form accepts it — move to the best-scoring view that does.
      var alt = state.plan.candidates.filter(function (c) {
        var e = c.enc;
        return [e.x, e.y, e.y2, e.color, e.size, e.row, e.col].concat(e.measures || []).concat(e.levels || [])
          .some(function (z) { return z && z.name === f.name; });
      })[0];
      if (alt) { setActive(alt); return; }
      flash('“' + f.label + '” is ' + (f.type === 'key' ? 'an identifier' : 'not usable') + ' here — nothing on this chart takes that kind of column.');
      return;
    }
    setActive(Object.assign({}, state.active, { enc: enc, custom: true }));
  }

  function flash(msg) {
    if (!dom.flash) return;
    dom.flash.textContent = msg;
    dom.flash.classList.add('is-on');
    clearTimeout(dom.flashT);
    dom.flashT = setTimeout(function () { dom.flash.classList.remove('is-on'); }, 4200);
  }

  /* ================= right rail: the builder ========================== */

  function renderRight() {
    U.clear(dom.right);
    if (!state.active) return;
    var spec = SPEC[state.active.id];
    var pool = state.profile.fields.concat(state.plan.derived);

    var forms = section('Chart type', null);
    var grid = el('div', { class: 'form-grid' });
    Object.keys(SPEC).forEach(function (id) {
      var chart = CB.charts[id];
      if (!chart) return;
      var b = el('button', {
        class: 'form-btn' + (id === state.active.id ? ' is-on' : ''),
        type: 'button', title: chart.label,
        'aria-pressed': id === state.active.id ? 'true' : 'false'
      });
      var svg = d3.select(b).append('svg').attr('viewBox', '0 0 20 20').attr('width', 20).attr('height', 20).attr('aria-hidden', 'true');
      svg.append('path').attr('d', chart.glyph).attr('fill', 'none').attr('stroke', 'currentColor')
        .attr('stroke-width', 1.6).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
      b.appendChild(el('span', { class: 'form-label', text: chart.label }));
      b.addEventListener('click', function () { switchForm(id); });
      grid.appendChild(b);
    });
    forms.appendChild(grid);
    dom.right.appendChild(forms);

    var enc = section('Encoding', null);
    (spec.slots || []).forEach(function (sl) {
      var opts = pool.filter(function (f) { return sl.accept.indexOf(f.type) >= 0; });
      enc.appendChild(select(sl.label, opts, state.active.enc[sl.key], function (f) {
        var next = Object.assign({}, state.active.enc);
        next[sl.key] = f;
        setActive(Object.assign({}, state.active, { enc: next, custom: true }));
      }, sl.optional || sl.count, sl.count ? 'Count of rows' : 'None'));
    });

    if (spec.multi) {
      enc.appendChild(el('span', { class: 'ctl-label', text: spec.multi.label }));
      var chosen = (state.active.enc.measures || []).map(function (m) { return m.name; });
      var box = el('div', { class: 'checks' });
      pool.filter(function (f) { return spec.multi.accept.indexOf(f.type) >= 0; }).forEach(function (f) {
        var on = chosen.indexOf(f.name) >= 0;
        var b = el('button', {
          class: 'check' + (on ? ' is-on' : ''), type: 'button',
          text: f.label, 'aria-pressed': on ? 'true' : 'false'
        });
        b.addEventListener('click', function () { applyField(f); });
        box.appendChild(b);
      });
      enc.appendChild(box);
      enc.appendChild(el('p', { class: 'ctl-hint', text: 'Pick between ' + spec.multi.min + ' and ' + spec.multi.max + '.' }));
    }

    if (spec.levels) {
      enc.appendChild(el('span', { class: 'ctl-label', text: 'Nest by' }));
      var lv = (state.active.enc.levels || []).map(function (m) { return m.name; });
      var lbox = el('div', { class: 'checks' });
      pool.filter(function (f) { return f.type === 'nominal' || f.type === 'boolean'; }).forEach(function (f) {
        var on = lv.indexOf(f.name) >= 0;
        var b = el('button', {
          class: 'check' + (on ? ' is-on' : ''), type: 'button',
          text: f.label + (on ? ' · ' + (lv.indexOf(f.name) + 1) : ''), 'aria-pressed': on ? 'true' : 'false'
        });
        b.addEventListener('click', function () { applyField(f); });
        lbox.appendChild(b);
      });
      enc.appendChild(lbox);
      enc.appendChild(el('p', { class: 'ctl-hint', text: 'Up to two levels; the order is the nesting order.' }));
    }

    if (spec.agg) {
      var aggOpts = Object.keys(CB.shape.AGGS).map(function (k) { return { name: k, label: CB.shape.AGGS[k].label }; });
      enc.appendChild(select('Aggregate', aggOpts, { name: currentAgg() }, function (o) {
        state.agg = o.name;
        renderRight(); renderStage();
      }));
    }
    dom.right.appendChild(enc);

    if (state.active.custom) {
      var reset = section(null, null);
      reset.appendChild(button('Back to the recommended view', 'ghost', function () {
        setActive(state.plan.candidates.filter(function (c) { return c.id === state.active.id; })[0] || state.plan.candidates[0]);
      }));
      dom.right.appendChild(reset);
    }
  }

  function currentAgg() {
    return state.agg || state.active.enc.agg || 'sum';
  }

  function select(label, options, current, onPick, allowNone, noneLabel) {
    var wrap = el('label', { class: 'ctl' });
    wrap.appendChild(el('span', { class: 'ctl-label', text: label }));
    var sel = el('select', { class: 'field' });
    if (allowNone) sel.appendChild(el('option', { value: '', text: noneLabel || 'None' }));
    options.forEach(function (f) {
      sel.appendChild(el('option', { value: f.name, text: f.label, selected: current && current.name === f.name }));
    });
    if (!options.length && !allowNone) {
      sel.appendChild(el('option', { value: '', text: 'no matching column' }));
      sel.disabled = true;
    }
    sel.addEventListener('change', function () {
      onPick(options.filter(function (f) { return f.name === sel.value; })[0] || null);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  /** Switching form keeps whatever encoding still fits and fills the rest from
   *  the best-scoring candidate of that form, so nothing resets to blank. */
  function switchForm(id) {
    if (id === state.active.id) return;
    var best = state.plan.candidates.filter(function (c) { return c.id === id; })[0];
    var spec = SPEC[id];
    var pool = state.profile.fields.concat(state.plan.derived);
    var enc = best ? Object.assign({}, best.enc) : {};
    var cur = state.active.enc;

    (spec.slots || []).forEach(function (sl) {
      if (enc[sl.key]) return;
      var carry = [cur.x, cur.y, cur.y2, cur.color, cur.size, cur.row, cur.col]
        .filter(function (f) { return f && sl.accept.indexOf(f.type) >= 0; })[0];
      enc[sl.key] = carry || pool.filter(function (f) { return sl.accept.indexOf(f.type) >= 0; })[0] || null;
    });
    if (spec.multi && !(enc.measures || []).length) {
      enc.measures = pool.filter(function (f) { return f.type === 'quantitative'; }).slice(0, spec.multi.max);
    }
    if (spec.levels && !(enc.levels || []).length) {
      enc.levels = pool.filter(function (f) { return f.type === 'nominal'; }).slice(0, 2);
    }

    var missing = (spec.slots || []).filter(function (sl) { return !sl.optional && !sl.count && !enc[sl.key]; });
    if (missing.length || (spec.multi && (enc.measures || []).length < spec.multi.min)) {
      flash(CB.charts[id].label + ' needs ' + (missing.length ? missing[0].label.toLowerCase() : spec.multi.min + ' measures') + ', and this file has no column that fits.');
      return;
    }
    setActive(best && !hasCustom(cur) ? best : {
      id: id, enc: enc, custom: true,
      title: best ? best.title : CB.charts[id].label,
      why: best ? best.why : 'Built by hand from the columns you picked.'
    });
  }

  function hasCustom(enc) { return state.active && state.active.custom; }

  function setActive(c) {
    state.active = c;
    state.hidden = new Set();
    state.agg = c.enc.agg || state.agg;
    renderRight(); renderStage(); renderLeft();
  }

  /* ================= filters ========================================== */

  function timeField() {
    var e = state.active ? state.active.enc : {};
    if (e.x && e.x.type === 'temporal') return e.x;
    return state.plan.times[0] || null;
  }

  var TIME_PRESETS = [
    { id: 'all', label: 'All time' },
    { id: '7', label: 'Last 7 days', days: 7 },
    { id: '30', label: 'Last 30 days', days: 30 },
    { id: '90', label: 'Last 90 days', days: 90 },
    { id: '365', label: 'Last 12 months', days: 365 }
  ];

  /** The filter row scopes the chart and the table together, so the numbers on
   *  screen always agree. Presets run back from the last date IN THE DATA. */
  function filtered() {
    var rows = state.profile.rows;
    var t = timeField();
    var f = state.filters;
    if (t && f.time !== 'all') {
      var preset = TIME_PRESETS.filter(function (p) { return p.id === f.time; })[0];
      if (preset && preset.days) {
        var cut = +t.max - preset.days * U.DAY;
        rows = rows.filter(function (r) { var v = t.get(r); return v && +v >= cut; });
      }
    }
    if (f.dimField && f.excluded.size) {
      var fld = f.dimField;
      rows = rows.filter(function (r) { return !f.excluded.has(fld.get(r)); });
    }
    return rows;
  }

  function filterRow() {
    var bar = el('div', { class: 'filters', role: 'group', 'aria-label': 'Filters' });
    var t = timeField();
    if (t && t.span > U.DAY * 8) {
      var group = el('div', { class: 'seg' });
      TIME_PRESETS.forEach(function (p) {
        if (p.days && p.days * U.DAY > t.span * 1.4) return;
        var on = state.filters.time === p.id;
        var b = el('button', {
          class: 'seg-btn' + (on ? ' is-on' : ''), type: 'button', text: p.label,
          'aria-pressed': on ? 'true' : 'false'
        });
        b.addEventListener('click', function () { state.filters.time = p.id; renderStage(); renderMeta(); });
        group.appendChild(b);
      });
      bar.appendChild(group);
    }

    var dims = state.profile.fields.filter(function (f) {
      return (f.type === 'nominal' || f.type === 'boolean') && f.distinct <= 30;
    });
    if (dims.length) {
      var current = state.filters.dimField || dims[0];
      var sel = el('select', { class: 'field field--inline', 'aria-label': 'Filter column' });
      dims.forEach(function (f) {
        sel.appendChild(el('option', { value: f.name, text: 'Filter: ' + f.label, selected: current.name === f.name }));
      });
      sel.addEventListener('change', function () {
        state.filters.dimField = dims.filter(function (f) { return f.name === sel.value; })[0];
        state.filters.excluded = new Set();
        renderStage(); renderMeta();
      });
      bar.appendChild(sel);

      var chips = el('div', { class: 'chips' });
      (current.categories || []).slice(0, 14).forEach(function (cat) {
        var on = !state.filters.excluded.has(cat);
        var b = el('button', {
          class: 'chip-btn' + (on ? '' : ' is-off'), type: 'button', text: U.ellipsis(cat, 18),
          title: cat, 'aria-pressed': on ? 'true' : 'false'
        });
        b.addEventListener('click', function () {
          state.filters.dimField = current;
          if (state.filters.excluded.has(cat)) state.filters.excluded.delete(cat);
          else state.filters.excluded.add(cat);
          renderStage(); renderMeta();
        });
        chips.appendChild(b);
      });
      if (state.filters.excluded.size) {
        var clear = el('button', { class: 'chip-btn chip-btn--clear', type: 'button', text: 'Show all' });
        clear.addEventListener('click', function () { state.filters.excluded = new Set(); renderStage(); renderMeta(); });
        chips.appendChild(clear);
      }
      bar.appendChild(chips);
    }
    return bar;
  }

  /* ================= the stage ======================================== */

  function renderStage() {
    if (!state.plan) return;
    U.clear(dom.stage);
    dom.stage.appendChild(gallery());
    dom.stage.appendChild(filterRow());

    var card = el('div', { class: 'card' });
    var head = el('div', { class: 'card-head' });
    head.appendChild(el('h1', { class: 'card-title', text: state.active.title }));
    head.appendChild(el('p', { class: 'card-why', text: state.active.why }));
    card.appendChild(head);

    dom.plot = el('div', { class: 'plot' });
    card.appendChild(dom.plot);
    dom.stage.appendChild(card);

    dom.flash = el('p', { class: 'flash', role: 'status', 'aria-live': 'polite' });
    dom.stage.appendChild(dom.flash);

    var rows = filtered();
    var table = null;
    if (!rows.length) {
      CB.frame.empty(dom.plot, 'The filters above leave no rows. Widen the time range or turn a category back on.');
    } else {
      var chart = CB.charts[state.active.id];
      var ctx = {
        rows: rows, enc: state.active.enc, cand: state.active,
        agg: currentAgg(), hidden: state.hidden,
        height: Math.max(340, Math.min(560, window.innerHeight - 380)),
        onToggle: function (key) {
          if (state.hidden.has(key)) state.hidden.delete(key); else state.hidden.add(key);
          renderStage();
        }
      };
      try {
        table = chart.render(dom.plot, ctx);
      } catch (e) {
        CB.frame.empty(dom.plot, 'That combination could not be drawn: ' + (e && e.message ? e.message : 'unexpected data shape') + '. Try another column or chart type.');
      }
    }
    dom.stage.appendChild(tablePanel(table));
    renderMeta();
  }

  function gallery() {
    var wrap = el('div', { class: 'gallery', role: 'tablist', 'aria-label': 'Recommended views' });
    wrap.appendChild(el('span', { class: 'gallery-head', text: 'Views this data supports' }));
    var strip = el('div', { class: 'gallery-strip' });
    state.plan.candidates.slice(0, 12).forEach(function (c, i) {
      var on = !state.active.custom && c.key === state.active.key;
      var chart = CB.charts[c.id];
      var b = el('button', {
        class: 'view' + (on ? ' is-on' : ''), type: 'button', role: 'tab',
        'aria-selected': on ? 'true' : 'false', title: c.why
      });
      var svg = d3.select(b).append('svg').attr('class', 'view-glyph')
        .attr('viewBox', '0 0 20 20').attr('width', 18).attr('height', 18).attr('aria-hidden', 'true');
      svg.append('path').attr('d', chart.glyph).attr('fill', 'none').attr('stroke', 'currentColor')
        .attr('stroke-width', 1.6).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
      b.appendChild(el('span', { class: 'view-text' }, [
        el('span', { class: 'view-title', text: c.title }),
        el('span', { class: 'view-kind', text: chart.label + (i === 0 ? ' · best fit' : '') })
      ]));
      b.addEventListener('click', function () { setActive(c); });
      strip.appendChild(b);
    });
    wrap.appendChild(strip);
    return wrap;
  }

  /** Every chart ships a table twin: the value a tooltip shows is always
   *  reachable without a pointer. */
  function tablePanel(table) {
    var wrap = el('div', { class: 'table-panel' });
    var toggle = el('button', {
      class: 'table-toggle', type: 'button',
      'aria-expanded': state.tableOpen ? 'true' : 'false',
      text: state.tableOpen ? 'Hide the numbers' : 'Show the numbers'
    });
    toggle.addEventListener('click', function () {
      state.tableOpen = !state.tableOpen;
      renderStage();
    });
    wrap.appendChild(toggle);
    if (table) {
      wrap.appendChild(button('Save this table as CSV', 'ghost', function () { saveCSV(table); }));
    }
    if (!state.tableOpen || !table) return wrap;

    var scroll = el('div', { class: 'table-scroll' });
    var t = el('table', { class: 'data-table' });
    var thead = el('thead');
    var hr = el('tr');
    table.columns.forEach(function (c, i) {
      hr.appendChild(el('th', { scope: 'col', text: String(c), class: i >= (table.numericFrom == null ? 1 : table.numericFrom) ? 'num' : '' }));
    });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    table.rows.slice(0, 400).forEach(function (r) {
      var tr = el('tr');
      r.forEach(function (v, i) {
        tr.appendChild(el('td', { text: v == null ? '—' : String(v), class: i >= (table.numericFrom == null ? 1 : table.numericFrom) ? 'num' : '' }));
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    scroll.appendChild(t);
    wrap.appendChild(scroll);
    var extra = (table.rows.length > 400 ? table.rows.length - 400 : 0) + (table.truncated || 0);
    if (extra) wrap.appendChild(el('p', { class: 'chart-note', text: U.precise(extra) + ' further rows are in the CSV export.' }));
    return wrap;
  }

  /* ================= drop target ====================================== */

  function wireDropTarget(node) {
    var overlay = el('div', { class: 'dropzone' }, [el('span', { text: 'Drop to load' })]);
    document.body.appendChild(overlay);
    var depth = 0;
    node.addEventListener('dragenter', function (e) {
      e.preventDefault(); depth++; overlay.classList.add('is-on');
    });
    node.addEventListener('dragover', function (e) { e.preventDefault(); });
    node.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; overlay.classList.remove('is-on'); } });
    node.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; overlay.classList.remove('is-on');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) load(function () { return CB.ingest.fromFile(f); });
    });
  }

  /* ================= export =========================================== */

  var downloadsNS;
  function downloads() {
    if (downloadsNS !== undefined) return Promise.resolve(downloadsNS);
    if (!window.claude || !window.claude.use) { downloadsNS = null; return Promise.resolve(null); }
    return window.claude.use('downloads').then(function (ns) { downloadsNS = ns; return ns; })
      .catch(function () { downloadsNS = null; return null; });
  }

  function saveFile(filename, data, mime) {
    return downloads().then(function (ns) {
      if (ns) {
        return ns.save({ filename: filename, data: data }).then(function () {
          flash('Saved ' + filename + '.');
        }, function (err) {
          var code = err && err.code;
          if (code === 'declined') return;
          if (code === 'unavailable' || code === 'not_granted') return anchorSave(filename, data, mime);
          flash('That save did not go through (' + (code || 'unknown') + ').');
        });
      }
      return anchorSave(filename, data, mime);
    });
  }

  /* Outside the hosted viewer — a local copy, or a deploy of this repo — an
   * ordinary download link is all it takes. */
  function anchorSave(filename, data, mime) {
    try {
      var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1200);
      flash('Saved ' + filename + '.');
    } catch (e) {
      flash('Saving is blocked here. “Copy SVG” puts the chart on your clipboard instead.');
    }
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'chart';
  }

  function svgMarkup() {
    var node = dom.plot && dom.plot.querySelector('svg');
    if (!node) return null;
    var pal = CB.palette.current();
    var clone = node.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('style', 'font-family:Archivo,system-ui,-apple-system,Segoe UI,sans-serif;background:' + pal.surface);
    var w = clone.getAttribute('width'), h = clone.getAttribute('height');
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', w); bg.setAttribute('height', h); bg.setAttribute('fill', pal.surface);
    clone.insertBefore(bg, clone.firstChild);
    return { markup: new XMLSerializer().serializeToString(clone), width: +w, height: +h };
  }

  function copySVG() {
    var out = svgMarkup();
    if (!out) { flash('There is no chart on screen to copy yet.'); return; }
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      flash('This browser will not let a page write to the clipboard. Use “Save chart” instead.');
      return;
    }
    navigator.clipboard.writeText(out.markup).then(function () {
      flash('The chart is on your clipboard as SVG — paste it into any design tool.');
    }, function () {
      flash('The clipboard write was refused. Use “Save chart” instead.');
    });
  }

  function saveChart(kind) {
    var out = svgMarkup();
    if (!out) { flash('There is no chart on screen to save yet.'); return; }
    var name = slug(state.active.title);
    if (kind === 'svg') {
      return saveFile(name + '.svg', out.markup, 'image/svg+xml');
    }
    var scale = 2;
    var canvas = document.createElement('canvas');
    canvas.width = out.width * scale; canvas.height = out.height * scale;
    var ctx2d = canvas.getContext('2d');
    var img = new Image();
    var url = URL.createObjectURL(new Blob([out.markup], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = function () {
      ctx2d.setTransform(scale, 0, 0, scale, 0, 0);
      ctx2d.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (blob) {
        if (!blob) { flash('The image could not be rendered here. “Save chart” gives you the SVG.'); return; }
        saveFile(name + '.png', blob, 'image/png');
      }, 'image/png');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      flash('The image could not be rendered here. “Save chart” gives you the SVG instead.');
    };
    img.src = url;
  }

  function saveCSV(table) {
    var esc = function (v) {
      v = v == null ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var text = [table.columns.map(esc).join(',')]
      .concat(table.rows.map(function (r) { return r.map(esc).join(','); })).join('\n');
    saveFile(slug(state.active.title) + '.csv', text, 'text/csv');
  }

  CB.app = { boot: boot, state: state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.CB);
