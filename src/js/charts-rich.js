/* Prism — the richer chart forms: the ones worth reaching for when the data
 * supports them, and the reason this is not just a bar-chart builder.
 */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var d3 = window.d3;
  var U = CB.util;
  var S = CB.shape;
  var F = CB.frame;
  var C = CB.charts;

  var hoverMarks = C._hoverMarks;
  var seriesColors = C._seriesColors;
  var fmtVal = C._fmtVal;
  var yTitle = C._yTitle;
  var barPath = C._barPath;

  /* A continuous scale needs its own legend: a stepped strip with real values,
   * because colour alone is never a readable quantity. */
  function scaleLegend(host, opts) {
    var wrap = U.el('div', { class: 'scale-legend' });
    if (opts.title) wrap.appendChild(U.el('span', { class: 'scale-title', text: opts.title }));
    var strip = U.el('div', { class: 'scale-strip' });
    opts.colors.forEach(function (c) {
      strip.appendChild(U.el('span', { class: 'scale-step', style: 'background:' + c, title: c }));
    });
    wrap.appendChild(strip);
    var ticks = U.el('div', { class: 'scale-ticks' });
    (opts.ticks || []).forEach(function (t) { ticks.appendChild(U.el('span', { text: t })); });
    wrap.appendChild(ticks);
    host.appendChild(wrap);
    return wrap;
  }

  /* ===================== calendar heatmap ============================== */

  C.calendar = {
    label: 'Calendar',
    glyph: 'M3,4 h14 v12 h-14 Z M3,8 h14 M7,4 v12 M11,4 v12 M15,4 v12',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var day = d3.utcDay;
      var byDay = d3.rollup(
        ctx.rows.filter(function (r) { return enc.x.get(r); }),
        function (v) { return S.reduce(v.map(enc.y ? enc.y.get : function () { return 1; }), ctx.agg); },
        function (r) { return +day.floor(enc.x.get(r)); }
      );
      var days = Array.from(byDay.keys()).sort(d3.ascending);
      if (days.length < 14) { F.empty(host, 'Fewer than two weeks of days — a calendar has nothing to show yet.'); return null; }

      var y0 = new Date(days[0]).getUTCFullYear();
      var y1 = new Date(days[days.length - 1]).getUTCFullYear();
      var years = d3.range(y0, y1 + 1);

      var box = host.getBoundingClientRect();
      var W = Math.max(360, Math.floor(box.width || 900));
      var labelW = 42;
      var cell = Math.max(8, Math.min(17, Math.floor((W - labelW - 30) / 53)));
      var yearH = cell * 7 + 30;
      var H = years.length * yearH + 26;

      var svg = d3.select(host).append('svg').attr('class', 'chart')
        .attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', W).attr('height', H)
        .attr('role', 'img').attr('aria-label', ctx.cand.title);

      var vals = Array.from(byDay.values()).filter(function (v) { return v != null; });
      var lo = d3.min(vals), hi = d3.max(vals);
      var steps = pal.sequential;
      var color = d3.scaleQuantize().domain([lo, hi]).range(steps);
      var fmt = fmtVal(enc.y, ctx.agg);
      var dayFmt = d3.utcFormat('%a %d %b %Y');

      years.forEach(function (yr, yi) {
        var g = svg.append('g').attr('transform', 'translate(' + labelW + ',' + (yi * yearH + 26) + ')');
        svg.append('text').attr('x', 10).attr('y', yi * yearH + 26 + cell * 3.6)
          .attr('fill', pal.ink2).attr('font-size', 12).attr('font-weight', 600).text(yr);

        ['M', 'W', 'F'].forEach(function (lab, i) {
          g.append('text').attr('x', -8).attr('y', cell * (i * 2 + 1) - 2)
            .attr('text-anchor', 'end').attr('fill', pal.muted).attr('font-size', 9).text(lab);
        });

        var start = new Date(Date.UTC(yr, 0, 1)), end = new Date(Date.UTC(yr + 1, 0, 1));
        var cells = day.range(start, end).map(function (d) {
          return { date: d, value: byDay.has(+d) ? byDay.get(+d) : null };
        });

        var week = function (d) { return d3.utcSunday.count(d3.utcYear(d), d); };
        var wd = function (d) { return (d.getUTCDay() + 6) % 7; };

        var rects = g.append('g').selectAll('rect').data(cells).join('rect')
          .attr('x', function (d) { return week(d.date) * cell; })
          .attr('y', function (d) { return wd(d.date) * cell; })
          // The 1.5px inset is the surface gap doing the separating.
          .attr('width', cell - 1.5).attr('height', cell - 1.5).attr('rx', 2)
          .attr('fill', function (d) { return d.value == null ? pal.grid : color(d.value); })
          .attr('aria-label', function (d) { return dayFmt(d.date) + ': ' + fmt(d.value); });

        hoverMarks(rects, function (d, ev) {
          F.tip.show(ev.clientX, ev.clientY, dayFmt(d.date), [
            { label: d.value == null ? 'no data' : yTitle(ctx), color: d.value == null ? pal.grid : color(d.value), value: d.value == null ? '—' : fmt(d.value) }
          ]);
        }, 0);

        // Month labels carry the divisions; an outline around every month
        // would be ink doing a job the labels already do.
        var months = d3.utcMonths(start, end);
        g.append('g').selectAll('text').data(months).join('text')
          .attr('x', function (m) { return week(m) * cell + 1; }).attr('y', -6)
          .attr('fill', pal.muted).attr('font-size', 9)
          .text(d3.utcFormat('%b'));
      });

      scaleLegend(host, {
        title: yTitle(ctx), colors: steps,
        ticks: [fmt(lo), fmt(lo + (hi - lo) / 2), fmt(hi)]
      });
      F.caption(host, U.precise(days.length) + ' days with data between ' +
        dayFmt(new Date(days[0])) + ' and ' + dayFmt(new Date(days[days.length - 1])) +
        '. Empty squares are days the file has no rows for.');

      return {
        columns: ['Date', yTitle(ctx)],
        rows: days.map(function (d) { return [d3.utcFormat('%Y-%m-%d')(new Date(d)), fmt(byDay.get(d))]; }),
        numericFrom: 1
      };
    }
  };

  /* ===================== matrix heatmap =============================== */

  C.heatmap = {
    label: 'Heatmap',
    glyph: 'M3,3 h5 v5 h-5 Z M9,3 h5 v5 h-5 Z M3,9 h5 v5 h-5 Z M9,9 h5 v5 h-5 Z',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var g = S.grid(ctx.rows, enc.row, enc.col, ctx.agg === 'count' ? null : enc.y, ctx.agg, { rows: 26, cols: 26 });
      if (!g.rows.length || !g.cols.length) { F.empty(host, 'Not enough of both dimensions to build a grid.'); return null; }

      var longest = d3.max(g.rows, function (d) { return String(d).length; });
      var left = Math.min(200, Math.max(64, longest * 6.6 + 12));
      var rotate = g.cols.length > 8 || d3.max(g.cols, function (d) { return String(d).length; }) > 6;
      var f = F.make(host, {
        height: Math.max(260, Math.min(ctx.height, g.rows.length * 34 + (rotate ? 110 : 60))),
        margin: { top: 14, right: 20, bottom: rotate ? 96 : 44, left: left }, aria: ctx.cand.title
      });

      var x = d3.scaleBand().domain(g.cols).range([0, f.w]).padding(0);
      var y = d3.scaleBand().domain(g.rows).range([0, f.h]).padding(0);
      var vals = g.cells.map(function (c) { return c.value; }).filter(function (v) { return v != null; });
      var color = d3.scaleQuantize().domain(d3.extent(vals)).range(pal.sequential);
      var fmt = fmtVal(enc.y, ctx.agg);

      F.axisBottom(f, x, { tickSize: 0, rotate: rotate, format: function (d) { return U.ellipsis(d, 18); } })
        .select('.domain').attr('stroke', 'none');
      F.axisLeft(f, y, { tickSize: 0, format: function (d) { return U.ellipsis(d, Math.floor(left / 6.6)); } })
        .select('.domain').attr('stroke', 'none');

      var cw = x.bandwidth() - 2, ch = y.bandwidth() - 2;
      var cells = f.g.append('g').selectAll('rect').data(g.cells).join('rect')
        .attr('x', function (d) { return x(d.col) + 1; })
        .attr('y', function (d) { return y(d.row) + 1; })
        .attr('width', Math.max(1, cw)).attr('height', Math.max(1, ch)).attr('rx', 2)
        .attr('fill', function (d) { return d.value == null ? pal.grid : color(d.value); })
        .attr('aria-label', function (d) { return d.row + ' / ' + d.col + ': ' + fmt(d.value); });

      // A label inside a cell only when it genuinely fits, picked light or dark
      // by the fill it sits on.
      if (cw > 46 && ch > 20) {
        var mid = (color.domain()[0] + color.domain()[1]) / 2;
        f.g.append('g').selectAll('text').data(g.cells.filter(function (d) { return d.value != null; }))
          .join('text')
          .attr('x', function (d) { return x(d.col) + x.bandwidth() / 2; })
          .attr('y', function (d) { return y(d.row) + y.bandwidth() / 2 + 4; })
          .attr('text-anchor', 'middle').attr('font-size', 11)
          .attr('font-variant-numeric', 'tabular-nums')
          .attr('fill', function (d) {
            var dark = pal.mode === 'dark' ? d.value < mid : d.value > mid;
            return dark ? (pal.mode === 'dark' ? '#0b0b0b' : '#ffffff') : pal.ink2;
          })
          .attr('pointer-events', 'none')
          .text(function (d) { return fmt(d.value); });
      }

      hoverMarks(cells, function (d, ev) {
        F.tip.show(ev.clientX, ev.clientY, d.row + ' · ' + d.col, [
          { label: yTitle(ctx), color: d.value == null ? pal.grid : color(d.value), value: fmt(d.value) },
          { label: 'rows', value: U.precise(d.n) }
        ]);
      }, g.cells.length);

      scaleLegend(host, {
        title: yTitle(ctx), colors: pal.sequential,
        ticks: [fmt(color.domain()[0]), fmt((color.domain()[0] + color.domain()[1]) / 2), fmt(color.domain()[1])]
      });

      return {
        columns: [enc.row.label].concat(g.cols),
        rows: g.rows.map(function (r) {
          return [r].concat(g.cols.map(function (c) {
            var cell = g.cells.filter(function (z) { return z.row === r && z.col === c; })[0];
            return fmt(cell && cell.value);
          }));
        }),
        numericFrom: 1
      };
    }
  };

  /* ===================== correlation matrix =========================== */

  C.corrMatrix = {
    label: 'Correlation',
    glyph: 'M3,3 h4 v4 h-4 Z M8,8 h4 v4 h-4 Z M13,13 h4 v4 h-4 Z M13,3 h4 v4 h-4 Z',
    render: function (host, ctx) {
      var pal = CB.palette.current();
      var ms = ctx.enc.measures;
      var pairs = S.correlations(ctx.rows, ms);
      if (!pairs.length) { F.empty(host, 'Not enough overlapping numeric values to correlate.'); return null; }

      var lookup = new Map();
      pairs.forEach(function (p) {
        lookup.set(p.a.name + '|' + p.b.name, p);
        lookup.set(p.b.name + '|' + p.a.name, p);
      });

      var names = ms.map(function (m) { return m.name; });
      var longest = d3.max(ms, function (m) { return m.label.length; });
      var left = Math.min(190, Math.max(80, longest * 6.6 + 10));
      var side = Math.min(ctx.height - 120, 460);
      var f = F.make(host, {
        height: side + 118,
        margin: { top: 10, right: 18, bottom: 104, left: left }, aria: ctx.cand.title
      });

      var x = d3.scaleBand().domain(names).range([0, Math.min(f.w, side)]).padding(0);
      var y = d3.scaleBand().domain(names).range([0, Math.min(f.h, side)]).padding(0);
      var maxAbs = 1;
      var color = CB.palette.divergingScale(pal, maxAbs);

      var label = {};
      ms.forEach(function (m) { label[m.name] = m.label; });
      F.axisBottom(f, x, { tickSize: 0, rotate: true, format: function (d) { return U.ellipsis(label[d], 18); } })
        .select('.domain').attr('stroke', 'none');
      F.axisLeft(f, y, { tickSize: 0, format: function (d) { return U.ellipsis(label[d], Math.floor(left / 6.6)); } })
        .select('.domain').attr('stroke', 'none');

      var cells = [];
      names.forEach(function (a) {
        names.forEach(function (b) {
          var r = a === b ? 1 : (lookup.get(a + '|' + b) || {}).r;
          cells.push({ a: a, b: b, r: r == null ? 0 : r, self: a === b, n: (lookup.get(a + '|' + b) || {}).n });
        });
      });

      var cw = x.bandwidth() - 2, ch = y.bandwidth() - 2;
      var rects = f.g.append('g').selectAll('rect').data(cells).join('rect')
        .attr('x', function (d) { return x(d.b) + 1; })
        .attr('y', function (d) { return y(d.a) + 1; })
        .attr('width', Math.max(1, cw)).attr('height', Math.max(1, ch)).attr('rx', 2)
        .attr('fill', function (d) { return d.self ? pal.grid : color(d.r); })
        .attr('aria-label', function (d) { return label[d.a] + ' vs ' + label[d.b] + ': r ' + d3.format('+.2f')(d.r); });

      if (cw > 34 && ch > 18) {
        f.g.append('g').selectAll('text').data(cells.filter(function (d) { return !d.self; })).join('text')
          .attr('x', function (d) { return x(d.b) + x.bandwidth() / 2; })
          .attr('y', function (d) { return y(d.a) + y.bandwidth() / 2 + 4; })
          .attr('text-anchor', 'middle').attr('font-size', 10.5)
          .attr('font-variant-numeric', 'tabular-nums').attr('pointer-events', 'none')
          .attr('fill', function (d) {
            return Math.abs(d.r) > 0.62 ? (pal.mode === 'dark' ? '#0b0b0b' : '#ffffff') : pal.ink2;
          })
          .text(function (d) { return d3.format('.2f')(d.r).replace(/^0\./, '.').replace(/^-0\./, '−.'); });
      }

      hoverMarks(rects, function (d, ev) {
        if (d.self) { F.tip.hide(); return; }
        F.tip.show(ev.clientX, ev.clientY, label[d.a] + ' × ' + label[d.b], [
          { label: 'Pearson r', color: color(d.r), value: d3.format('+.3f')(d.r) },
          { label: 'shared rows', value: U.precise(d.n || 0) },
          { label: 'of variance explained', value: d3.format('.0%')(d.r * d.r) }
        ]);
      }, cells.length);

      scaleLegend(host, {
        title: 'Pearson r',
        colors: d3.range(-1, 1.001, 0.125).map(color),
        ticks: ['−1 inverse', '0 none', '+1 direct']
      });

      return {
        columns: ['Measure'].concat(ms.map(function (m) { return m.label; })),
        rows: names.map(function (a) {
          return [label[a]].concat(names.map(function (b) {
            var c = cells.filter(function (z) { return z.a === a && z.b === b; })[0];
            return d3.format('+.3f')(c.r);
          }));
        }),
        numericFrom: 1
      };
    }
  };

  /* ===================== treemap ====================================== */

  C.treemap = {
    label: 'Treemap',
    glyph: 'M3,3 h9 v7 h-9 Z M13,3 h4 v7 h-4 Z M3,11 h5 v5 h-5 Z M9,11 h8 v5 h-8 Z',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var levels = enc.levels;
      var root = { name: 'root', children: [] };
      var index = new Map();

      ctx.rows.forEach(function (r) {
        var v = enc.y ? enc.y.get(r) : 1;
        if (v == null || !(v > 0)) return;
        var k1 = levels[0].get(r);
        if (k1 == null || ctx.hidden.has(k1)) return;
        var n1 = index.get(k1);
        if (!n1) { n1 = { name: k1, children: [], byKey: new Map(), value: 0 }; index.set(k1, n1); root.children.push(n1); }
        n1.value += v;
        if (levels[1]) {
          var k2 = levels[1].get(r);
          if (k2 == null) return;
          var n2 = n1.byKey.get(k2);
          if (!n2) { n2 = { name: k2, value: 0, parent: k1 }; n1.byKey.set(k2, n2); n1.children.push(n2); }
          n2.value += v;
        }
      });
      root.children.forEach(function (n) { if (!n.children.length) n.children = null; });
      if (!root.children.length) { F.empty(host, 'No positive values to size the blocks with.'); return null; }

      root.children.sort(function (a, b) { return b.value - a.value; });
      // Past eight groups, the tail folds — never a ninth generated hue.
      var top = root.children.slice(0, 8).map(function (n) { return n.name; });
      var color = seriesColors(pal, top, 'adjacent');

      var box = host.getBoundingClientRect();
      var W = Math.max(320, Math.floor(box.width || 900));
      var H = Math.max(300, Math.min(ctx.height, 560));

      var hier = d3.hierarchy(root, function (d) { return d.children; })
        .sum(function (d) { return d.children ? 0 : d.value; })
        .sort(function (a, b) { return b.value - a.value; });
      d3.treemap().tile(d3.treemapSquarify).size([W, H]).paddingOuter(2)
        .paddingTop(levels[1] ? 21 : 2).paddingInner(2)(hier);

      var svg = d3.select(host).append('svg').attr('class', 'chart')
        .attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', W).attr('height', H)
        .attr('role', 'img').attr('aria-label', ctx.cand.title);

      var total = hier.value;
      var fmt = fmtVal(enc.y, 'sum');
      var leaves = hier.leaves().filter(function (d) { return d.x1 - d.x0 > 1 && d.y1 - d.y0 > 1; });

      if (levels[1]) {
        svg.append('g').selectAll('text').data(hier.children || []).join('text')
          .attr('x', function (d) { return d.x0 + 4; }).attr('y', function (d) { return d.y0 + 14; })
          .attr('fill', pal.ink2).attr('font-size', 11).attr('font-weight', 600)
          .text(function (d) {
            var room = Math.floor((d.x1 - d.x0 - 8) / 6.4);
            return room > 3 ? U.ellipsis(d.data.name, room) : '';
          });
      }

      var g = svg.append('g').selectAll('g').data(leaves).join('g')
        .attr('transform', function (d) { return 'translate(' + d.x0 + ',' + d.y0 + ')'; });

      var groupOf = function (d) { return levels[1] ? d.parent.data.name : d.data.name; };
      g.append('rect')
        .attr('width', function (d) { return d.x1 - d.x0; })
        .attr('height', function (d) { return d.y1 - d.y0; })
        .attr('rx', 2)
        .attr('fill', function (d) { return color(groupOf(d)); })
        .attr('fill-opacity', function (d) { return levels[1] ? 0.55 + 0.45 * (d.value / (d.parent.value || 1)) : 0.92; })
        .attr('aria-label', function (d) { return d.data.name + ': ' + fmt(d.value); });

      // Only label a block when the text actually fits inside it.
      g.each(function (d) {
        var w = d.x1 - d.x0, h = d.y1 - d.y0;
        var room = Math.floor((w - 10) / 6.2);
        if (room < 4 || h < 26) return;
        var sel = d3.select(this);
        var light = pal.mode === 'dark' ? '#0b0b0b' : '#ffffff';
        sel.append('text').attr('x', 6).attr('y', 15)
          .attr('fill', light).attr('font-size', 11).attr('font-weight', 600)
          .attr('pointer-events', 'none')
          .text(U.ellipsis(d.data.name, room));
        if (h >= 40) {
          sel.append('text').attr('x', 6).attr('y', 30)
            .attr('fill', light).attr('font-size', 10.5).attr('opacity', 0.8)
            .attr('font-variant-numeric', 'tabular-nums').attr('pointer-events', 'none')
            .text(fmt(d.value));
        }
      });

      hoverMarks(g.selectAll('rect'), function (d, ev) {
        var rows = [{ label: yTitle(ctx), color: color(groupOf(d)), value: fmt(d.value) },
          { label: 'of total', value: d3.format('.1%')(d.value / total) }];
        if (levels[1]) rows.push({ label: 'of ' + groupOf(d), value: d3.format('.1%')(d.value / d.parent.value) });
        F.tip.show(ev.clientX, ev.clientY, d.data.name, rows);
      }, leaves.length);

      F.legend(host, root.children.slice(0, 8).map(function (n) {
        return { label: n.name, color: color(n.name), onToggle: ctx.onToggle };
      }), 'rect', function (k) { return !ctx.hidden.has(k); });
      F.caption(host, 'Block area is share of the ' + fmt(total) + ' total' +
        (levels[1] ? ', nested by ' + levels[0].label.toLowerCase() + ' then ' + levels[1].label.toLowerCase() : '') + '.');

      return {
        columns: (levels[1] ? [levels[0].label, levels[1].label] : [levels[0].label]).concat([yTitle(ctx), 'Share']),
        rows: leaves.map(function (d) {
          var base = levels[1] ? [groupOf(d), d.data.name] : [d.data.name];
          return base.concat([fmt(d.value), d3.format('.2%')(d.value / total)]);
        }),
        numericFrom: levels[1] ? 2 : 1
      };
    }
  };

  /* ===================== parallel coordinates ========================= */

  C.parallel = {
    label: 'Parallel',
    glyph: 'M4,3 v14 M10,3 v14 M16,3 v14 M4,12 L10,6 L16,10',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var ms = enc.measures;
      var recs = [];
      for (var i = 0; i < ctx.rows.length; i++) {
        var r = ctx.rows[i], vals = [], ok = true;
        for (var j = 0; j < ms.length; j++) {
          var v = ms[j].get(r);
          if (v == null || !Number.isFinite(v)) { ok = false; break; }
          vals.push(v);
        }
        if (!ok) continue;
        var c = enc.color ? enc.color.get(r) : null;
        if (enc.color && ctx.hidden.has(c)) continue;
        recs.push({ v: vals, c: c });
      }
      if (recs.length < 4) { F.empty(host, 'Too few records have every measure filled in.'); return null; }
      var t = S.thin(recs, 4000);
      recs = t.rows;

      var f = F.make(host, {
        height: Math.max(320, Math.min(ctx.height, 520)),
        margin: { top: 30, right: 58, bottom: 34, left: 58 }, aria: ctx.cand.title
      });

      var x = d3.scalePoint().domain(d3.range(ms.length)).range([0, f.w]);
      var scales = ms.map(function (m, k) {
        return d3.scaleLinear().domain(d3.extent(recs, function (d) { return d.v[k]; })).nice(5).range([f.h, 0]);
      });

      var keys = enc.color ? Array.from(new Set(recs.map(function (d) { return d.c; }))).filter(Boolean).sort() : [];
      var color = enc.color ? seriesColors(pal, keys, 'adjacent') : function () { return pal.categorical[0]; };

      var line = d3.line()
        .x(function (d, k) { return x(k); })
        .y(function (d, k) { return scales[k](d); });

      var alpha = recs.length > 1500 ? 0.09 : recs.length > 500 ? 0.18 : 0.34;
      var lines = f.g.append('g').attr('fill', 'none').selectAll('path').data(recs).join('path')
        .attr('d', function (d) { return line(d.v); })
        .attr('stroke', function (d) { return color(d.c); })
        .attr('stroke-width', 1)
        .attr('stroke-opacity', alpha);

      var brushes = new Array(ms.length).fill(null);

      var axes = f.g.append('g').selectAll('g').data(ms).join('g')
        .attr('transform', function (d, k) { return 'translate(' + x(k) + ',0)'; });

      axes.each(function (m, k) {
        var g = d3.select(this);
        g.call(d3.axisLeft(scales[k]).ticks(6).tickSize(4).tickPadding(6)
          .tickFormat(F.valueFormat(scales[k], m)));
        g.select('.domain').attr('stroke', f.pal.axis);
        g.selectAll('.tick line').attr('stroke', f.pal.axis);
        // Thousands of threads run behind these labels: a surface-coloured
        // halo under the glyphs is what keeps them readable.
        g.selectAll('.tick text').attr('fill', f.pal.muted).attr('font-size', 10)
          .attr('stroke', f.pal.surface).attr('stroke-width', 3).attr('paint-order', 'stroke');
        g.append('text').attr('y', -12).attr('text-anchor', k === 0 ? 'start' : k === ms.length - 1 ? 'end' : 'middle')
          .attr('fill', f.pal.ink2).attr('font-size', 11).attr('font-weight', 600)
          .attr('stroke', f.pal.surface).attr('stroke-width', 3).attr('paint-order', 'stroke')
          .text(U.ellipsis(m.label, 16));

        var brush = d3.brushY()
          .extent([[-14, 0], [14, f.h]])
          .on('brush end', function (ev) {
            brushes[k] = ev.selection ? ev.selection.map(scales[k].invert).sort(d3.ascending) : null;
            applyBrush();
          });
        g.append('g').attr('class', 'pc-brush').call(brush);
      });

      var countNode = U.el('p', { class: 'chart-note' });
      function applyBrush() {
        var active = brushes.some(Boolean);
        var kept = 0;
        lines.each(function (d) {
          var on = true;
          for (var k = 0; k < brushes.length; k++) {
            var b = brushes[k];
            if (b && (d.v[k] < b[0] || d.v[k] > b[1])) { on = false; break; }
          }
          if (on) kept++;
          d3.select(this)
            .attr('stroke', on ? color(d.c) : pal.deemphasis)
            .attr('stroke-opacity', on ? (active ? Math.min(0.6, alpha * 3) : alpha) : 0.04);
        });
        countNode.textContent = active
          ? U.precise(kept) + ' of ' + U.precise(recs.length) + ' records match the brushed ranges. Click an axis to clear it.'
          : 'Drag vertically on any axis to filter; the threads that survive stay lit.' +
            (t.thinned ? ' ' + U.precise(t.thinned) + ' records were sampled out for speed.' : '');
      }
      applyBrush();

      if (enc.color && keys.length > 1) {
        F.legend(host, keys.map(function (k) { return { label: k, color: color(k), onToggle: ctx.onToggle }; }),
          'line', function (k) { return !ctx.hidden.has(k); });
      }
      host.appendChild(countNode);

      return {
        columns: (enc.color ? [enc.color.label] : []).concat(ms.map(function (m) { return m.label; })),
        rows: recs.slice(0, 800).map(function (d) {
          return (enc.color ? [d.c == null ? '—' : d.c] : []).concat(d.v.map(U.compact));
        }),
        numericFrom: enc.color ? 1 : 0,
        truncated: Math.max(0, recs.length - 800)
      };
    }
  };

  /* ===================== radial bar =================================== */

  C.radial = {
    label: 'Radial',
    glyph: 'M10,10 m0,-7 a7,7 0 1,1 -0.1,0 M10,10 L10,3 M10,10 L16,13',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var data = S.ranked(ctx.rows, enc.x, ctx.agg === 'count' ? null : enc.y, ctx.agg, 0);
      if (enc.x.cyclic) {
        var order = enc.x.cyclic.order;
        data.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
      }
      if (data.length < 3) { F.empty(host, 'A ring needs at least three positions.'); return null; }

      var size = Math.max(300, Math.min(ctx.height, 520));
      var box = host.getBoundingClientRect();
      var W = Math.max(300, Math.floor(box.width || 700));
      var cx = W / 2, cy = size / 2;
      var outer = Math.min(W, size) / 2 - 46;
      var inner = outer * 0.34;

      var svg = d3.select(host).append('svg').attr('class', 'chart')
        .attr('viewBox', '0 0 ' + W + ' ' + size).attr('width', W).attr('height', size)
        .attr('role', 'img').attr('aria-label', ctx.cand.title);
      var g = svg.append('g').attr('transform', 'translate(' + cx + ',' + cy + ')');

      var a = d3.scaleBand().domain(data.map(function (d) { return d.key; }))
        .range([0, 2 * Math.PI]).padding(0.14);
      var maxV = d3.max(data, function (d) { return d.value; });
      var rs = d3.scaleRadial().domain([0, maxV]).range([inner, outer]);
      var fmt = fmtVal(enc.y, ctx.agg);

      // Circular gridlines carry the values the bars are measured against.
      var ticks = rs.ticks(4).filter(function (t) { return t > 0; });
      g.append('g').selectAll('circle').data(ticks).join('circle')
        .attr('r', rs).attr('fill', 'none').attr('stroke', pal.grid).attr('stroke-width', 1);
      g.append('g').selectAll('text').data(ticks).join('text')
        .attr('y', function (d) { return -rs(d); }).attr('dy', '-0.3em')
        .attr('text-anchor', 'middle').attr('fill', pal.muted).attr('font-size', 10)
        .attr('font-variant-numeric', 'tabular-nums')
        .text(function (d) { return F.valueFormat(d3.scaleLinear().domain([0, maxV]), enc.y)(d); });

      var arc = d3.arc().innerRadius(inner).outerRadius(function (d) { return rs(d.value); })
        .startAngle(function (d) { return a(d.key); })
        .endAngle(function (d) { return a(d.key) + a.bandwidth(); })
        .padAngle(0.006).padRadius(inner).cornerRadius(3);

      var fill = pal.categorical[0];
      var arcs = g.append('g').selectAll('path').data(data).join('path')
        .attr('fill', fill)
        .attr('d', arc)
        .attr('aria-label', function (d) { return d.key + ': ' + fmt(d.value); });

      if (!U.reducedMotion()) {
        arcs.attr('opacity', 0).transition().duration(480)
          .delay(function (d, i) { return i * 24; }).attr('opacity', 1);
      }

      g.append('g').selectAll('text').data(data).join('text')
        .attr('transform', function (d) {
          var ang = a(d.key) + a.bandwidth() / 2;
          var r = outer + 14;
          var deg = (ang * 180) / Math.PI - 90;
          var flip = ang > Math.PI;
          return 'rotate(' + deg + ') translate(' + r + ',0) rotate(' + (flip ? 180 : 0) + ')';
        })
        .attr('text-anchor', function (d) { return (a(d.key) + a.bandwidth() / 2) > Math.PI ? 'end' : 'start'; })
        .attr('dy', '0.32em').attr('fill', pal.ink2).attr('font-size', 10.5)
        .text(function (d) { return U.ellipsis(d.key, 9); });

      hoverMarks(arcs, function (d, ev) {
        F.tip.show(ev.clientX, ev.clientY, d.key, [
          { label: yTitle(ctx), color: fill, value: fmt(d.value) },
          { label: 'rows', value: U.precise(d.n) }
        ]);
      }, data.length);

      F.caption(host, 'The ring closes: ' + data[0].key + ' sits next to ' + data[data.length - 1].key +
        ', which is where a straight axis would have cut the cycle.');

      return {
        columns: [enc.x.label, yTitle(ctx), 'Rows'],
        rows: data.map(function (d) { return [d.key, fmt(d.value), U.precise(d.n)]; }),
        numericFrom: 1
      };
    }
  };

  /* ===================== ridgeline ==================================== */

  C.ridgeline = {
    label: 'Ridgeline',
    glyph: 'M2,7 q4,-5 8,0 t8,0 M2,12 q5,-6 9,0 t7,0 M2,17 q3,-4 7,0 t9,0',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var groups = d3.group(ctx.rows, enc.color.get);
      var series = [];
      groups.forEach(function (rs, key) {
        if (key == null || ctx.hidden.has(key)) return;
        var vals = rs.map(enc.y.get).filter(function (v) { return v != null && Number.isFinite(v); });
        if (vals.length < 8) return;
        series.push({ key: key, values: vals, median: d3.median(vals), n: vals.length });
      });
      if (series.length < 2) { F.empty(host, 'Needs at least two groups with enough values each.'); return null; }
      if (enc.color.cyclic) {
        var order = enc.color.cyclic.order;
        series.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
      } else {
        series.sort(function (a, b) { return d3.descending(a.median, b.median); });
      }
      series = series.slice(0, 14);

      var lane = 46;
      var longest = d3.max(series, function (s) { return String(s.key).length; });
      var left = Math.min(210, Math.max(84, longest * 6.6 + 12));
      var f = F.make(host, {
        height: series.length * lane + 92,
        margin: { top: 34, right: 62, bottom: 46, left: left }, aria: ctx.cand.title
      });

      var all = [];
      series.forEach(function (s) { all = all.concat(s.values); });
      var domain = [d3.quantile(all.slice().sort(d3.ascending), 0.002), d3.quantile(all.slice().sort(d3.ascending), 0.998)];
      if (!(domain[1] > domain[0])) domain = d3.extent(all);
      var x = d3.scaleLinear().domain(domain).nice(6).range([0, f.w]);

      series.forEach(function (s) { s.d = S.density(s.values, x.domain(), 96); });
      var peak = d3.max(series, function (s) { return d3.max(s.d, function (p) { return p.y; }); }) || 1;
      var yLane = d3.scalePoint().domain(series.map(function (s) { return s.key; }))
        .range([0, series.length * lane]).padding(0.5);
      var amp = d3.scaleLinear().domain([0, peak]).range([0, lane * 1.55]);

      F.gridX(f, x, 6);
      F.axisBottom(f, x, { ticks: 6, format: F.valueFormat(x, enc.y), label: enc.y.label });

      // One hue for every ridge: this is small multiples of one distribution,
      // and identity comes from the direct label, not from colour.
      var ordered = !!enc.color.cyclic;
      var ramp = ordered ? CB.palette.ordinal(pal, series.length) : null;
      var hueOf = function (s, i) { return ordered ? ramp[i] : pal.categorical[0]; };

      var area = d3.area()
        .x(function (p) { return x(p.x); })
        .y0(0).y1(function (p) { return -amp(p.y); })
        .curve(d3.curveBasis);
      var lineGen = d3.line()
        .x(function (p) { return x(p.x); })
        .y(function (p) { return -amp(p.y); })
        .curve(d3.curveBasis);

      var g = f.g.append('g').selectAll('g').data(series).join('g')
        .attr('transform', function (s) { return 'translate(0,' + yLane(s.key) + ')'; });

      g.append('path').attr('d', function (s) { return area(s.d); })
        .attr('fill', hueOf).attr('fill-opacity', 0.16);
      g.append('path').attr('d', function (s) { return lineGen(s.d); })
        .attr('fill', 'none').attr('stroke', hueOf).attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round');
      g.append('line')
        .attr('x1', function (s) { return x(s.median); }).attr('x2', function (s) { return x(s.median); })
        .attr('y1', 2).attr('y2', -14)
        .attr('stroke', pal.ink).attr('stroke-width', 1).attr('opacity', 0.6);
      g.append('text')
        .attr('x', -12).attr('y', 0).attr('text-anchor', 'end')
        .attr('fill', pal.ink2).attr('font-size', 11.5)
        .text(function (s) { return U.ellipsis(s.key, Math.floor(left / 6.6)); });
      g.append('text')
        .attr('x', f.w + 10).attr('y', 0)
        .attr('fill', pal.muted).attr('font-size', 10.5).attr('font-variant-numeric', 'tabular-nums')
        .text(function (s) { return U.precise(s.n); });

      f.g.append('text').attr('x', f.w + 10).attr('y', -14)
        .attr('fill', pal.muted).attr('font-size', 10).text('records');
      f.g.append('text').attr('x', -12).attr('y', -14).attr('text-anchor', 'end')
        .attr('fill', pal.muted).attr('font-size', 10).text(enc.color.label);

      hoverMarks(g.append('rect')
        .attr('x', 0).attr('y', -lane).attr('width', f.w).attr('height', lane * 1.4)
        .attr('fill', 'transparent'), function (s, ev) {
          var sorted = s.values.slice().sort(d3.ascending);
          F.tip.show(ev.clientX, ev.clientY, s.key, [
            { label: 'median ' + enc.y.label.toLowerCase(), color: pal.categorical[0], value: U.compact(s.median) },
            { label: 'p05 – p95', value: U.compact(d3.quantile(sorted, 0.05)) + ' – ' + U.compact(d3.quantile(sorted, 0.95)) },
            { label: 'records', value: U.precise(s.n) }
          ]);
        }, series.length);

      F.caption(host, 'Each curve is a kernel density estimate over ' + enc.y.label.toLowerCase() +
        '; the upright tick is that group’s median. Ordered by median, tallest ridge = most concentrated.');

      return {
        columns: [enc.color.label, 'Records', 'Median', 'p05', 'p95', 'Min', 'Max'],
        rows: series.map(function (s) {
          var sorted = s.values.slice().sort(d3.ascending);
          return [s.key, U.precise(s.n), U.compact(s.median),
            U.compact(d3.quantile(sorted, 0.05)), U.compact(d3.quantile(sorted, 0.95)),
            U.compact(sorted[0]), U.compact(sorted[sorted.length - 1])];
        }),
        numericFrom: 1
      };
    }
  };

  /* ===================== beeswarm ===================================== */

  C.beeswarm = {
    label: 'Beeswarm',
    glyph: 'M4,10 a1.4,1.4 0 1,0 0.1,0 M7,7 a1.4,1.4 0 1,0 0.1,0 M7,13 a1.4,1.4 0 1,0 0.1,0 M10,10 a1.4,1.4 0 1,0 0.1,0 M13,8 a1.4,1.4 0 1,0 0.1,0 M16,10 a1.4,1.4 0 1,0 0.1,0',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var groups = d3.group(ctx.rows, enc.color.get);
      var lanes = [];
      groups.forEach(function (rs, key) {
        if (key == null || ctx.hidden.has(key)) return;
        var vals = rs.map(enc.y.get).filter(function (v) { return v != null && Number.isFinite(v); });
        if (!vals.length) return;
        lanes.push({ key: key, values: vals, median: d3.median(vals) });
      });
      if (!lanes.length) { F.empty(host, 'No groups with numeric values.'); return null; }
      lanes.sort(function (a, b) { return d3.descending(a.median, b.median); });
      lanes = lanes.slice(0, 10);

      var laneH = 66;
      var longest = d3.max(lanes, function (s) { return String(s.key).length; });
      var left = Math.min(200, Math.max(80, longest * 6.6 + 12));
      var f = F.make(host, {
        height: lanes.length * laneH + 80,
        margin: { top: 22, right: 30, bottom: 46, left: left }, aria: ctx.cand.title
      });

      var allVals = [];
      lanes.forEach(function (l) { allVals = allVals.concat(l.values); });
      var x = d3.scaleLinear().domain(d3.extent(allVals)).nice(6).range([0, f.w]);
      var yLane = d3.scalePoint().domain(lanes.map(function (l) { return l.key; }))
        .range([0, lanes.length * laneH]).padding(0.5);
      var keys = lanes.map(function (l) { return l.key; });
      var color = seriesColors(pal, keys, 'adjacent');

      F.gridX(f, x, 6);
      F.axisBottom(f, x, { ticks: 6, format: F.valueFormat(x, enc.y), label: enc.y.label });

      var cap = Math.max(200, Math.floor(6000 / lanes.length));
      var totalThinned = 0;
      var points = [];
      lanes.forEach(function (l) {
        var t = S.thin(l.values.slice().sort(d3.ascending), cap);
        totalThinned += t.thinned;
        var placed = dodge(t.rows.map(function (v) { return x(v); }), 5.2);
        t.rows.forEach(function (v, i) {
          points.push({ key: l.key, value: v, px: x(v), py: yLane(l.key) + placed[i] });
        });
      });

      var dots = f.g.append('g').selectAll('circle').data(points).join('circle')
        .attr('cx', function (d) { return d.px; })
        .attr('cy', function (d) { return d.py; })
        .attr('r', 2.6)
        .attr('fill', function (d) { return color(d.key); })
        .attr('fill-opacity', 0.72);

      if (!U.reducedMotion()) {
        dots.attr('cy', function (d) { return yLane(d.key); })
          .transition().duration(600).delay(function (d, i) { return Math.min(320, i * 0.12); })
          .attr('cy', function (d) { return d.py; });
      }

      // Median rule per lane — the summary the dots are the evidence for.
      var lg = f.g.append('g').selectAll('g').data(lanes).join('g')
        .attr('transform', function (l) { return 'translate(0,' + yLane(l.key) + ')'; });
      lg.append('line')
        .attr('x1', function (l) { return x(l.median); }).attr('x2', function (l) { return x(l.median); })
        .attr('y1', -22).attr('y2', 22)
        .attr('stroke', pal.ink).attr('stroke-width', 1.5).attr('opacity', 0.7);
      lg.append('text')
        .attr('x', -12).attr('text-anchor', 'end').attr('dy', '0.32em')
        .attr('fill', pal.ink2).attr('font-size', 11.5)
        .text(function (l) { return U.ellipsis(l.key, Math.floor(left / 6.6)); });

      var delaunay = d3.Delaunay.from(points, function (d) { return d.px; }, function (d) { return d.py; });
      var halo = f.g.append('circle').attr('r', 6).attr('fill', 'none')
        .attr('stroke', pal.ink).attr('stroke-width', 1.5).attr('opacity', 0);
      F.capture(f)
        .on('pointermove', function (ev) {
          var p = d3.pointer(ev, f.g.node());
          var i = delaunay.find(p[0], p[1]);
          if (i == null || i < 0) return;
          var d = points[i];
          halo.attr('cx', d.px).attr('cy', d.py).attr('opacity', 0.85);
          var lane = lanes.filter(function (l) { return l.key === d.key; })[0];
          F.tip.show(ev.clientX, ev.clientY, d.key, [
            { label: enc.y.label, color: color(d.key), value: U.compact(d.value) },
            { label: 'group median', value: U.compact(lane.median) }
          ]);
        })
        .on('pointerleave', function () { halo.attr('opacity', 0); F.tip.hide(); });

      var notes = ['One dot per record, nudged sideways only enough to stop overlap; the upright rule is each group’s median.'];
      if (totalThinned) notes.push(U.precise(totalThinned) + ' dots were sampled out to keep the swarm legible.');
      F.caption(host, notes.join(' '));

      return {
        columns: [enc.color.label, 'Records', 'Median', 'Min', 'Max'],
        rows: lanes.map(function (l) {
          var s = l.values.slice().sort(d3.ascending);
          return [l.key, U.precise(l.values.length), U.compact(l.median), U.compact(s[0]), U.compact(s[s.length - 1])];
        }),
        numericFrom: 1
      };
    }
  };

  /** Place points along one axis, offsetting each just far enough to clear the
   *  ones already placed. Input must be sorted by position. */
  function dodge(positions, radius) {
    var out = new Array(positions.length).fill(0);
    var placed = [];
    var r2 = (radius * 2) * (radius * 2);
    for (var i = 0; i < positions.length; i++) {
      var px = positions[i];
      var candidates = [0];
      for (var k = 1; k <= 14; k++) { candidates.push(k * radius * 1.7); candidates.push(-k * radius * 1.7); }
      var chosen = 0;
      for (var c = 0; c < candidates.length; c++) {
        var oy = candidates[c], clash = false;
        for (var j = placed.length - 1; j >= 0; j--) {
          var p = placed[j];
          if (px - p.x > radius * 2) break;
          var dx = px - p.x, dy = oy - p.y;
          if (dx * dx + dy * dy < r2) { clash = true; break; }
        }
        if (!clash) { chosen = oy; break; }
      }
      out[i] = chosen;
      placed.push({ x: px, y: chosen });
      if (placed.length > 400) placed.splice(0, 100);
    }
    return out;
  }

  CB.charts._scaleLegend = scaleLegend;
})(window.CB);
