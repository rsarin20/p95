/* Prism — core chart forms.
 * Every renderer returns a table view of exactly what it drew, so no value is
 * ever reachable only by hovering.
 */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var d3 = window.d3;
  var U = CB.util;
  var S = CB.shape;
  var F = CB.frame;

  CB.charts = CB.charts || {};

  /* ---- shared bits ---------------------------------------------------- */

  /** A bar with its data-end rounded and its baseline end square. */
  function barPath(x, y, w, h, r, side) {
    r = Math.max(0, Math.min(r, side === 'top' || side === 'bottom' ? h : w, side === 'top' || side === 'bottom' ? w / 2 : h / 2));
    if (h <= 0 || w <= 0) return '';
    if (side === 'top') {
      return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + -r +
        'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'V' + (y + h) + 'Z';
    }
    if (side === 'bottom') {
      return 'M' + x + ',' + y + 'V' + (y + h - r) + 'a' + r + ',' + r + ' 0 0 0 ' + r + ',' + r +
        'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 0 ' + r + ',' + -r + 'V' + y + 'Z';
    }
    if (side === 'left') {
      return 'M' + (x + w) + ',' + y + 'H' + (x + r) + 'a' + r + ',' + r + ' 0 0 0 ' + -r + ',' + r +
        'v' + (h - 2 * r) + 'a' + r + ',' + r + ' 0 0 0 ' + r + ',' + r + 'H' + (x + w) + 'Z';
    }
    return 'M' + x + ',' + y + 'H' + (x + w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
      'v' + (h - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + -r + ',' + r + 'H' + x + 'Z';
  }

  function seriesColors(pal, keys, form) {
    var scale = CB.palette.categoricalScale(pal, keys, form);
    return function (k) { return k === 'Other' ? pal.deemphasis : scale(k); };
  }

  function fmtVal(field, agg) {
    return function (v) {
      if (v == null) return '—';
      var s = U.compact(v);
      if (agg === 'count') return s;
      if (field && field.percentLike) return s + '%';
      return s;
    };
  }

  function yTitle(ctx) {
    var enc = ctx.enc;
    return ctx.agg === 'count' ? 'Rows' : CB.recommend.measureTitle(ctx.agg, enc.y);
  }

  /** Direct end-labels only survive when the series actually separate; when
   *  they converge, the legend and tooltip carry identity instead. */
  function labelsFit(positions, minGap) {
    var sorted = positions.slice().sort(d3.ascending);
    for (var i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < (minGap || 15)) return false;
    return true;
  }

  function visible(ctx, keys) {
    return keys.filter(function (k) { return !ctx.hidden.has(k); });
  }

  /* ===================== line ========================================== */

  CB.charts.line = {
    label: 'Line',
    glyph: 'M2,14 L7,8 L12,11 L18,3',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var shaped = S.series(ctx.rows, enc.x, enc.y, ctx.agg, enc.color, { limit: 8, target: 420 });
      var all = shaped.series;
      if (!all.length || shaped.xs.length < 2) {
        F.empty(host, 'Not enough points on that axis to draw a line. Try a different x, or the distribution view.');
        return null;
      }
      var keys = all.map(function (s) { return s.key; });
      var color = seriesColors(pal, keys, 'adjacent');
      var shown = all.filter(function (s) { return !ctx.hidden.has(s.key); });
      if (!shown.length) shown = all;

      var multi = keys.length > 1 || !!enc.color;
      var f = F.make(host, {
        height: ctx.height,
        margin: { top: 20, right: multi && keys.length <= 4 ? 104 : 26, bottom: 42, left: 66 },
        aria: ctx.cand.title
      });

      var temporal = enc.x.type === 'temporal';
      var xDomain = d3.extent(shaped.xs);
      var x = (temporal ? d3.scaleUtc() : d3.scaleLinear()).domain(xDomain).range([0, f.w]);
      if (enc.x.type === 'nominal') {
        x = d3.scalePoint().domain(shaped.xs).range([0, f.w]).padding(0.5);
      }
      var vals = [];
      shown.forEach(function (s) { s.values.forEach(function (v) { if (v.y != null) vals.push(v.y); }); });
      var lo = d3.min(vals), hi = d3.max(vals);
      var y = d3.scaleLinear().domain([Math.min(0, lo), hi]).nice(6).range([f.h, 0]);

      F.gridY(f, y, 5);
      F.axisLeft(f, y, { ticks: 5, format: F.valueFormat(y, enc.y), label: yTitle(ctx) });
      F.axisBottom(f, x, {
        ticks: Math.max(3, Math.min(8, Math.floor(f.w / 110))),
        format: temporal ? U.tickDateFmt(enc.x.span || 0) : null
      });

      var line = d3.line()
        .defined(function (d) { return d.y != null; })
        .x(function (d) { return x(d.x); })
        .y(function (d) { return y(d.y); })
        .curve(d3.curveMonotoneX);

      // A single series is a magnitude over time: give it a wash under the line.
      if (shown.length === 1) {
        var area = d3.area()
          .defined(function (d) { return d.y != null; })
          .x(function (d) { return x(d.x); })
          .y0(y(Math.max(0, y.domain()[0])))
          .y1(function (d) { return y(d.y); })
          .curve(d3.curveMonotoneX);
        f.g.append('path').attr('d', area(shown[0].values))
          .attr('fill', color(shown[0].key)).attr('opacity', 0.1);
      }

      var paths = f.g.append('g').selectAll('path').data(shown).join('path')
        .attr('fill', 'none')
        .attr('stroke', function (d) { return color(d.key); })
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
        .attr('d', function (d) { return line(d.values); });

      if (!U.reducedMotion()) {
        paths.each(function () {
          var len = this.getTotalLength();
          d3.select(this).attr('stroke-dasharray', len + ' ' + len).attr('stroke-dashoffset', len)
            .transition().duration(700).ease(d3.easeCubicOut)
            .attr('stroke-dashoffset', 0)
            .on('end', function () { d3.select(this).attr('stroke-dasharray', null); });
        });
      }

      // End markers + selective direct labels.
      var ends = shown.map(function (s) {
        var last = null;
        for (var i = s.values.length - 1; i >= 0; i--) if (s.values[i].y != null) { last = s.values[i]; break; }
        return last ? { key: s.key, v: last } : null;
      }).filter(Boolean);

      f.g.append('g').selectAll('circle').data(ends).join('circle')
        .attr('cx', function (d) { return x(d.v.x); })
        .attr('cy', function (d) { return y(d.v.y); })
        .attr('r', 4)
        .attr('fill', function (d) { return color(d.key); })
        .attr('stroke', pal.surface).attr('stroke-width', 2);

      var canLabel = multi && shown.length <= 4 &&
        labelsFit(ends.map(function (d) { return y(d.v.y); }), 15);
      if (canLabel) {
        f.g.append('g').selectAll('text').data(ends).join('text')
          .attr('x', function (d) { return x(d.v.x) + 10; })
          .attr('y', function (d) { return y(d.v.y) + 4; })
          .attr('fill', pal.ink2).attr('font-size', 11)
          .text(function (d) { return U.ellipsis(d.key, 12); });
      } else if (!multi) {
        f.g.append('g').selectAll('text').data(ends).join('text')
          .attr('x', function (d) { return x(d.v.x) - 6; })
          .attr('y', function (d) { return y(d.v.y) - 12; })
          .attr('text-anchor', 'end')
          .attr('fill', pal.ink).attr('font-size', 12).attr('font-weight', 600)
          .text(function (d) { return fmtVal(enc.y, ctx.agg)(d.v.y); });
      }

      // Crosshair: one readout for every series at the nearest x.
      var cross = F.crosshair(f);
      var xs = shaped.xs;
      var dateOf = U.dateFmt(enc.x.span);
      F.capture(f)
        .on('pointermove', function (ev) {
          var mx = d3.pointer(ev, f.g.node())[0];
          var idx = nearestIndex(xs, x, mx);
          if (idx < 0) return;
          cross.at(x(xs[idx]));
          var head = temporal ? dateOf(xs[idx]) : String(xs[idx]);
          var rows = shown.map(function (s) {
            return { label: multi ? s.key : yTitle(ctx), color: color(s.key), value: fmtVal(enc.y, ctx.agg)(s.values[idx] && s.values[idx].y) };
          });
          F.tip.show(ev.clientX, ev.clientY, head, rows);
        })
        .on('pointerleave', function () { cross.off(); F.tip.hide(); });

      if (multi) {
        F.legend(host, all.map(function (s) {
          return {
            label: s.key, color: color(s.key), onToggle: ctx.onToggle,
            note: s.isOther ? s.folded + ' smaller series folded together' : null
          };
        }), 'line', function (k) { return !ctx.hidden.has(k); });
      }
      var note = [];
      if (shaped.bucket && shaped.bucket !== enc.x.granularity) note.push('Bucketed by ' + shaped.bucket + ' to keep the axis readable.');
      if (shaped.trimmed) note.push('The final ' + shaped.bucket + ' is left off — the data stops part-way through it, so plotting it would draw a drop that is not in the data.');
      if (all.some(function (s) { return s.isOther; })) note.push('Series past the eighth are folded into “Other”.');
      if (note.length) F.caption(host, note.join(' '));

      return tableFromSeries(shaped, enc, ctx, temporal ? dateOf : String);
    }
  };

  function nearestIndex(xs, scale, mx) {
    if (!xs.length) return -1;
    var best = -1, bestD = Infinity;
    for (var i = 0; i < xs.length; i++) {
      var d = Math.abs(scale(xs[i]) - mx);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function tableFromSeries(shaped, enc, ctx, xFmt) {
    var multi = shaped.series.length > 1 || !!enc.color;
    var cols = [enc.x.label].concat(multi ? shaped.series.map(function (s) { return s.key; }) : [yTitle(ctx)]);
    var fmt = fmtVal(enc.y, ctx.agg);
    var rows = shaped.xs.map(function (xv, i) {
      return [xFmt(xv)].concat(shaped.series.map(function (s) { return fmt(s.values[i] && s.values[i].y); }));
    });
    return { columns: cols, rows: rows, numericFrom: 1 };
  }

  /* ===================== stacked area ================================== */

  CB.charts.area = {
    label: 'Stacked area',
    glyph: 'M2,15 L6,9 L11,12 L16,5 L18,6 L18,15 Z',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var shaped = S.series(ctx.rows, enc.x, enc.y, ctx.agg, enc.color, { limit: 7, target: 420, fillGaps: true });
      var all = shaped.series;
      if (!all.length || shaped.xs.length < 2) { F.empty(host, 'Not enough points to stack.'); return null; }
      var keys = all.map(function (s) { return s.key; });
      var color = seriesColors(pal, keys, 'adjacent');
      var shownKeys = visible(ctx, keys);
      if (!shownKeys.length) shownKeys = keys;

      var f = F.make(host, { height: ctx.height, margin: { top: 20, right: 26, bottom: 42, left: 66 }, aria: ctx.cand.title });
      var wide = shaped.xs.map(function (xv, i) {
        var o = { x: xv };
        all.forEach(function (s) { o[s.key] = shownKeys.indexOf(s.key) >= 0 ? (s.values[i].y || 0) : 0; });
        return o;
      });
      var stack = d3.stack().keys(shownKeys).order(d3.stackOrderInsideOut).offset(d3.stackOffsetNone);
      var layers = stack(wide);

      var temporal = enc.x.type === 'temporal';
      // A categorical x has no numeric extent — it needs a point scale, or every
      // stacked path resolves to NaN.
      var x = enc.x.type === 'nominal' || enc.x.type === 'boolean'
        ? d3.scalePoint().domain(shaped.xs).range([0, f.w]).padding(0.5)
        : (temporal ? d3.scaleUtc() : d3.scaleLinear()).domain(d3.extent(shaped.xs)).range([0, f.w]);
      var y = d3.scaleLinear().domain([0, d3.max(layers[layers.length - 1] || [], function (d) { return d[1]; }) || 1])
        .nice(5).range([f.h, 0]);

      F.gridY(f, y, 5);
      F.axisLeft(f, y, { ticks: 5, format: F.valueFormat(y, enc.y), label: yTitle(ctx) });
      F.axisBottom(f, x, {
        ticks: Math.max(3, Math.floor(f.w / 110)),
        format: temporal ? U.tickDateFmt(enc.x.span || 0) : null,
        rotate: x.step && x.step() < 64
      });

      var area = d3.area()
        .x(function (d) { return x(d.data.x); })
        .y0(function (d) { return y(d[0]); })
        .y1(function (d) { return y(d[1]); })
        .curve(d3.curveMonotoneX);

      // The 2px separation is the surface showing through, not a stroke.
      f.g.append('g').selectAll('path').data(layers).join('path')
        .attr('fill', function (d) { return color(d.key); })
        .attr('fill-opacity', 0.88)
        .attr('stroke', pal.surface).attr('stroke-width', 2).attr('stroke-linejoin', 'round')
        .attr('d', area);

      var cross = F.crosshair(f);
      var dateOf = U.dateFmt(enc.x.span);
      F.capture(f)
        .on('pointermove', function (ev) {
          var mx = d3.pointer(ev, f.g.node())[0];
          var idx = nearestIndex(shaped.xs, x, mx);
          if (idx < 0) return;
          cross.at(x(shaped.xs[idx]));
          var fmt = fmtVal(enc.y, ctx.agg);
          var rows = shownKeys.map(function (k) {
            var s = all.filter(function (z) { return z.key === k; })[0];
            return { label: k, color: color(k), value: fmt(s.values[idx].y) };
          });
          rows.push({ label: 'Total', value: fmt(d3.sum(shownKeys, function (k) {
            var s = all.filter(function (z) { return z.key === k; })[0];
            return s.values[idx].y || 0;
          })) });
          F.tip.show(ev.clientX, ev.clientY, temporal ? dateOf(shaped.xs[idx]) : String(shaped.xs[idx]), rows);
        })
        .on('pointerleave', function () { cross.off(); F.tip.hide(); });

      F.legend(host, all.map(function (s) {
        return { label: s.key, color: color(s.key), onToggle: ctx.onToggle, note: s.isOther ? s.folded + ' folded' : null };
      }), 'rect', function (k) { return !ctx.hidden.has(k); });

      var anote = [];
      if (shaped.bucket && shaped.bucket !== enc.x.granularity) anote.push('Bucketed by ' + shaped.bucket + '.');
      if (shaped.trimmed) anote.push('The final ' + shaped.bucket + ' is left off — the data stops part-way through it.');
      if (anote.length) F.caption(host, anote.join(' '));

      return tableFromSeries(shaped, enc, ctx, temporal ? dateOf : String);
    }
  };

  /* ===================== ranked bar ==================================== */

  CB.charts.bar = {
    label: 'Ranked bar',
    glyph: 'M2,4 H16 M2,9 H12 M2,14 H7',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var data = S.ranked(ctx.rows, enc.x, ctx.agg === 'count' ? null : enc.y, ctx.agg, 26);
      if (!data.length) { F.empty(host, 'No categories to rank.'); return null; }

      var rowH = 30;
      var height = Math.max(220, Math.min(ctx.height, data.length * rowH + 62));
      var longest = d3.max(data, function (d) { return String(d.key).length; });
      var left = Math.min(260, Math.max(90, longest * 6.6 + 14));
      var f = F.make(host, { height: height, margin: { top: 12, right: 74, bottom: 36, left: left }, aria: ctx.cand.title });

      var y = d3.scaleBand().domain(data.map(function (d) { return d.key; })).range([0, f.h]).paddingInner(0.34);
      var maxV = d3.max(data, function (d) { return d.value; });
      var minV = Math.min(0, d3.min(data, function (d) { return d.value; }));
      var x = d3.scaleLinear().domain([minV, maxV]).nice(5).range([0, f.w]);
      var zero = x(0);

      F.gridX(f, x, 5);
      F.axisBottom(f, x, { ticks: 5, format: F.valueFormat(x, enc.y), label: yTitle(ctx) });
      F.axisLeft(f, y, { tickSize: 0 }).select('.domain').attr('stroke', 'none');

      // Nominal categories carry no order, so every bar is slot 1 — a value
      // ramp here would double-encode length as colour.
      var thickness = Math.min(24, y.bandwidth());
      var fill = pal.categorical[0];
      var fmt = fmtVal(enc.y, ctx.agg);

      var bars = f.g.append('g').attr('role', 'list').selectAll('path').data(data).join('path')
        .attr('fill', function (d) { return d.isOther ? pal.deemphasis : fill; })
        .attr('d', function (d) {
          var w = Math.abs(x(d.value) - zero);
          var x0 = d.value < 0 ? x(d.value) : zero;
          return barPath(x0, y(d.key) + (y.bandwidth() - thickness) / 2, w, thickness, 4, d.value < 0 ? 'left' : 'right');
        })
        .attr('aria-label', function (d) { return d.key + ': ' + fmt(d.value); });

      if (!U.reducedMotion()) {
        bars.attr('opacity', 0).transition().duration(430).delay(function (d, i) { return i * 14; })
          .attr('opacity', 1);
      }

      f.g.append('g').selectAll('text').data(data).join('text')
        .attr('x', function (d) { return (d.value < 0 ? x(d.value) - 8 : x(d.value) + 8); })
        .attr('y', function (d) { return y(d.key) + y.bandwidth() / 2 + 4; })
        .attr('text-anchor', function (d) { return d.value < 0 ? 'end' : 'start'; })
        .attr('fill', pal.ink2).attr('font-size', 11).attr('font-variant-numeric', 'tabular-nums')
        .text(function (d) { return fmt(d.value); });

      hoverMarks(bars, function (d, ev) {
        F.tip.show(ev.clientX, ev.clientY, d.key, [
          { label: yTitle(ctx), color: d.isOther ? pal.deemphasis : fill, value: fmt(d.value) },
          { label: 'rows', value: U.precise(d.n) }
        ]);
      }, data.length);

      if (data.some(function (d) { return d.isOther; })) {
        F.caption(host, 'The tail past the top 25 is folded into “Other”.');
      }
      return {
        columns: [enc.x.label, yTitle(ctx), 'Rows'],
        rows: data.map(function (d) { return [d.key, fmt(d.value), U.precise(d.n)]; }),
        numericFrom: 1
      };
    }
  };

  /** Hover + focus behave identically; the mark lifts so the reader sees it respond. */
  function hoverMarks(sel, show, count) {
    sel.style('cursor', 'crosshair')
      .on('pointerenter pointermove', function (ev, d) { d3.select(this).attr('opacity', 0.78); show(d, ev); })
      .on('pointerleave', function () { d3.select(this).attr('opacity', 1); F.tip.hide(); });
    F.focusable(sel, count || 0, function (ev, d) {
      var c = F.centerOf(this);
      d3.select(this).attr('opacity', 0.78);
      show(d, { clientX: c.x, clientY: c.y });
    }, function () { d3.select(this).attr('opacity', 1); F.tip.hide(); });
    return sel;
  }

  /* ===================== grouped & stacked columns ===================== */

  function columnChart(kind) {
    return {
      label: kind === 'stacked' ? 'Stacked bar' : 'Grouped bar',
      glyph: kind === 'stacked' ? 'M4,15 V7 H8 V15 M12,15 V4 H16 V15' : 'M3,15 V8 H6 V15 M8,15 V5 H11 V15 M14,15 V10 H17 V15',
      render: function (host, ctx) {
        var enc = ctx.enc, pal = CB.palette.current();
        var g = S.grid(ctx.rows, enc.x, enc.color, ctx.agg === 'count' ? null : enc.y, ctx.agg, { rows: 14, cols: 7 });
        if (!g.rows.length || !g.cols.length) { F.empty(host, 'Not enough of both dimensions to compare.'); return null; }
        var keys = g.cols;
        var color = seriesColors(pal, keys, 'adjacent');
        var shownKeys = visible(ctx, keys);
        if (!shownKeys.length) shownKeys = keys;

        var longest = d3.max(g.rows, function (d) { return String(d).length; });
        var rotate = g.rows.length > 6 || longest > 9;
        var f = F.make(host, {
          height: ctx.height,
          margin: { top: 18, right: 24, bottom: rotate ? 82 : 44, left: 66 },
          aria: ctx.cand.title
        });

        var x0 = d3.scaleBand().domain(g.rows).range([0, f.w]).paddingInner(0.26);
        var byRow = d3.rollup(g.cells, function (v) { return v[0]; }, function (d) { return d.row; }, function (d) { return d.col; });
        var fmt = fmtVal(enc.y, ctx.agg);
        var maxV;

        if (kind === 'stacked') {
          maxV = d3.max(g.rows, function (r) {
            return d3.sum(shownKeys, function (c) { var e = byRow.get(r) && byRow.get(r).get(c); return e && e.value > 0 ? e.value : 0; });
          });
        } else {
          maxV = d3.max(g.cells, function (d) { return shownKeys.indexOf(d.col) >= 0 ? d.value : null; });
        }
        var y = d3.scaleLinear().domain([0, maxV || 1]).nice(5).range([f.h, 0]);

        F.gridY(f, y, 5);
        F.axisLeft(f, y, { ticks: 5, format: F.valueFormat(y, enc.y), label: yTitle(ctx) });
        F.axisBottom(f, x0, { tickSize: 0, rotate: rotate, format: function (d) { return U.ellipsis(d, rotate ? 16 : 12); } });

        var marks;
        if (kind === 'stacked') {
          var wide = g.rows.map(function (r) {
            var o = { row: r };
            shownKeys.forEach(function (c) { var e = byRow.get(r) && byRow.get(r).get(c); o[c] = e && e.value > 0 ? e.value : 0; });
            return o;
          });
          var layers = d3.stack().keys(shownKeys)(wide);
          var bw = Math.min(34, x0.bandwidth());
          var flat = [];
          layers.forEach(function (L) {
            L.forEach(function (d) { flat.push({ key: L.key, row: d.data.row, y0: d[0], y1: d[1] }); });
          });
          marks = f.g.append('g').selectAll('rect').data(flat).join('rect')
            .attr('x', function (d) { return x0(d.row) + (x0.bandwidth() - bw) / 2; })
            .attr('width', bw)
            .attr('y', function (d) { return y(d.y1); })
            // The 2px surface gap between segments — never a border.
            .attr('height', function (d) { return Math.max(0, y(d.y0) - y(d.y1) - 2); })
            .attr('fill', function (d) { return color(d.key); })
            .attr('aria-label', function (d) { return d.row + ' ' + d.key + ': ' + fmt(d.y1 - d.y0); });
          hoverMarks(marks, function (d, ev) {
            var total = d3.sum(shownKeys, function (c) { var e = byRow.get(d.row) && byRow.get(d.row).get(c); return e && e.value > 0 ? e.value : 0; });
            F.tip.show(ev.clientX, ev.clientY, d.row, [
              { label: d.key, color: color(d.key), value: fmt(d.y1 - d.y0) },
              { label: 'of ' + fmt(total) + ' total', value: d3.format('.0%')((d.y1 - d.y0) / (total || 1)) }
            ]);
          }, flat.length);
        } else {
          var x1 = d3.scaleBand().domain(shownKeys).range([0, x0.bandwidth()]).padding(0.14);
          var bw2 = Math.min(24, x1.bandwidth());
          var cells = g.cells.filter(function (d) { return shownKeys.indexOf(d.col) >= 0 && d.value != null; });
          marks = f.g.append('g').selectAll('path').data(cells).join('path')
            .attr('fill', function (d) { return color(d.col); })
            .attr('d', function (d) {
              var h = Math.max(0, f.h - y(Math.max(0, d.value)));
              return barPath(x0(d.row) + x1(d.col) + (x1.bandwidth() - bw2) / 2, y(Math.max(0, d.value)), bw2, h, 4, 'top');
            })
            .attr('aria-label', function (d) { return d.row + ' ' + d.col + ': ' + fmt(d.value); });
          hoverMarks(marks, function (d, ev) {
            F.tip.show(ev.clientX, ev.clientY, d.row, [
              { label: d.col, color: color(d.col), value: fmt(d.value) },
              { label: 'rows', value: U.precise(d.n) }
            ]);
          }, cells.length);
        }

        if (!U.reducedMotion()) {
          marks.attr('opacity', 0).transition().duration(400).delay(function (d, i) { return i * 6; }).attr('opacity', 1);
        }

        F.legend(host, keys.map(function (k) {
          return { label: k, color: color(k), onToggle: ctx.onToggle };
        }), 'rect', function (k) { return !ctx.hidden.has(k); });

        return {
          columns: [enc.x.label].concat(keys),
          rows: g.rows.map(function (r) {
            return [r].concat(keys.map(function (c) {
              var e = byRow.get(r) && byRow.get(r).get(c);
              return fmt(e ? e.value : null);
            }));
          }),
          numericFrom: 1
        };
      }
    };
  }

  CB.charts.groupedBar = columnChart('grouped');
  CB.charts.stackedBar = columnChart('stacked');

  /* ===================== histogram ===================================== */

  CB.charts.histogram = {
    label: 'Histogram',
    glyph: 'M3,15 V12 M6,15 V6 M9,15 V3 M12,15 V7 M15,15 V11 M18,15 V14',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var field = enc.y;
      var values = [];
      for (var i = 0; i < ctx.rows.length; i++) {
        var v = field.get(ctx.rows[i]);
        if (v != null && Number.isFinite(v)) values.push(v);
      }
      if (values.length < 4) { F.empty(host, 'Too few numeric values to bin.'); return null; }

      var f = F.make(host, { height: ctx.height, margin: { top: 30, right: 26, bottom: 46, left: 66 }, aria: ctx.cand.title });
      var ext = d3.extent(values);
      var x = d3.scaleLinear().domain(ext).nice(Math.min(30, Math.ceil(f.w / 26))).range([0, f.w]);
      var bins = d3.bin().domain(x.domain()).thresholds(Math.min(40, Math.max(8, Math.round(f.w / 26))))(values);
      var y = d3.scaleLinear().domain([0, d3.max(bins, function (b) { return b.length; })]).nice(5).range([f.h, 0]);

      F.gridY(f, y, 5);
      F.axisLeft(f, y, { ticks: 5, format: d3.format(','), label: 'Records' });
      F.axisBottom(f, x, { ticks: Math.max(4, Math.floor(f.w / 90)), format: F.valueFormat(x, field), label: field.label });

      var fill = pal.categorical[0];
      var marks = f.g.append('g').selectAll('path').data(bins).join('path')
        .attr('fill', fill)
        .attr('d', function (d) {
          var w = Math.max(1, x(d.x1) - x(d.x0) - 2);   // the 2px is the surface gap
          return barPath(x(d.x0) + 1, y(d.length), w, f.h - y(d.length), 4, 'top');
        })
        .attr('aria-label', function (d) { return U.compact(d.x0) + ' to ' + U.compact(d.x1) + ': ' + d.length; });

      if (!U.reducedMotion()) {
        marks.attr('opacity', 0).transition().duration(380).delay(function (d, i) { return i * 9; }).attr('opacity', 1);
      }

      // Median as a labelled reference rule — the one statistic a shape needs.
      var med = d3.median(values);
      f.g.append('line')
        .attr('x1', x(med)).attr('x2', x(med)).attr('y1', -8).attr('y2', f.h)
        .attr('stroke', pal.ink).attr('stroke-width', 1).attr('opacity', 0.55);
      f.g.append('text')
        .attr('x', x(med)).attr('y', -14).attr('text-anchor', 'middle')
        .attr('fill', pal.ink2).attr('font-size', 11)
        .text('median ' + U.compact(med));

      hoverMarks(marks, function (d, ev) {
        F.tip.show(ev.clientX, ev.clientY, U.compact(d.x0) + ' – ' + U.compact(d.x1), [
          { label: 'records', color: fill, value: U.precise(d.length) },
          { label: 'of all', value: d3.format('.1%')(d.length / values.length) }
        ]);
      }, bins.length);

      return {
        columns: ['Bin start', 'Bin end', 'Records', 'Share'],
        rows: bins.map(function (b) {
          return [U.compact(b.x0), U.compact(b.x1), U.precise(b.length), d3.format('.1%')(b.length / values.length)];
        }),
        numericFrom: 0
      };
    }
  };

  /* ===================== scatter / bubble ============================== */

  CB.charts.scatter = {
    label: 'Scatter',
    glyph: 'M4,13 a1.6,1.6 0 1,0 0.1,0 M9,7 a1.6,1.6 0 1,0 0.1,0 M14,10 a1.6,1.6 0 1,0 0.1,0 M17,4 a1.6,1.6 0 1,0 0.1,0',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var pts = [];
      for (var i = 0; i < ctx.rows.length; i++) {
        var r = ctx.rows[i];
        var xv = enc.x.get(r), yv = enc.y.get(r);
        if (xv == null || yv == null || !Number.isFinite(xv) || !Number.isFinite(yv)) continue;
        var c = enc.color ? enc.color.get(r) : null;
        if (enc.color && ctx.hidden.has(c)) continue;
        pts.push({ x: xv, y: yv, c: c, s: enc.size ? enc.size.get(r) : null, row: r });
      }
      if (pts.length < 3) { F.empty(host, 'Too few complete pairs to plot.'); return null; }
      var t = S.thin(pts, 9000);
      pts = t.rows;

      var f = F.make(host, { height: ctx.height, margin: { top: 22, right: 28, bottom: 48, left: 68 }, aria: ctx.cand.title });
      var x = d3.scaleLinear().domain(d3.extent(pts, function (d) { return d.x; })).nice(6).range([0, f.w]);
      var y = d3.scaleLinear().domain(d3.extent(pts, function (d) { return d.y; })).nice(6).range([f.h, 0]);

      F.gridY(f, y, 5); F.gridX(f, x, 6);
      F.axisLeft(f, y, { ticks: 5, format: F.valueFormat(y, enc.y), label: enc.y.label });
      F.axisBottom(f, x, { ticks: 6, format: F.valueFormat(x, enc.x), label: enc.x.label });

      var keys = enc.color ? Array.from(new Set(pts.map(function (d) { return d.c; }))).filter(Boolean).sort() : [];
      // Scatter is an all-pairs form: three hues is the cap that still separates.
      var color = enc.color ? seriesColors(pal, keys, 'all-pairs') : function () { return pal.categorical[0]; };

      var rScale = enc.size
        ? d3.scaleSqrt().domain(d3.extent(pts, function (d) { return d.s; })).range([3, 15])
        : null;
      var radius = function (d) { return rScale && d.s != null ? rScale(d.s) : 4.5; };

      // Least-squares fit: the relationship the recommender scored, drawn.
      var xs = pts.map(function (d) { return d.x; }), ys = pts.map(function (d) { return d.y; });
      var r = S.pearson(xs, ys);
      var mx = d3.mean(xs), my = d3.mean(ys);
      var sx = d3.deviation(xs), sy = d3.deviation(ys);
      if (sx && sy) {
        var slope = r * (sy / sx);
        var dom = x.domain();
        f.g.append('line')
          .attr('x1', x(dom[0])).attr('y1', y(my + slope * (dom[0] - mx)))
          .attr('x2', x(dom[1])).attr('y2', y(my + slope * (dom[1] - mx)))
          .attr('stroke', pal.ink2).attr('stroke-width', 1).attr('opacity', 0.5);
      }

      var dots = f.g.append('g').selectAll('circle').data(pts).join('circle')
        .attr('cx', function (d) { return x(d.x); })
        .attr('cy', function (d) { return y(d.y); })
        .attr('r', radius)
        .attr('fill', function (d) { return color(d.c); })
        .attr('fill-opacity', pts.length > 900 ? 0.5 : 0.78)
        .attr('stroke', pal.surface).attr('stroke-width', pts.length > 2500 ? 0 : 2);

      if (!U.reducedMotion()) {
        dots.attr('r', 0).transition().duration(520).delay(function (d, i) { return Math.min(400, i * 0.4); })
          .attr('r', radius);
      }

      // Nearest-point hover: the pointer only has to be closest, never dead-centre.
      var delaunay = d3.Delaunay.from(pts, function (d) { return x(d.x); }, function (d) { return y(d.y); });
      var halo = f.g.append('circle')
        .attr('r', 0).attr('fill', 'none').attr('stroke', pal.ink).attr('stroke-width', 1.5).attr('opacity', 0);
      var fx = F.valueFormat(x, enc.x), fy = F.valueFormat(y, enc.y);
      F.capture(f)
        .on('pointermove', function (ev) {
          var p = d3.pointer(ev, f.g.node());
          var i = delaunay.find(p[0], p[1]);
          if (i == null || i < 0) return;
          var d = pts[i];
          halo.attr('cx', x(d.x)).attr('cy', y(d.y)).attr('r', radius(d) + 4).attr('opacity', 0.8);
          var rows = [
            { label: enc.y.label, color: color(d.c), value: U.compact(d.y) },
            { label: enc.x.label, value: U.compact(d.x) }
          ];
          if (enc.size && d.s != null) rows.push({ label: enc.size.label, value: U.compact(d.s) });
          F.tip.show(ev.clientX, ev.clientY, enc.color && d.c ? String(d.c) : null, rows);
        })
        .on('pointerleave', function () { halo.attr('opacity', 0); F.tip.hide(); });

      if (enc.color && keys.length > 1) {
        F.legend(host, keys.map(function (k) { return { label: k, color: color(k), onToggle: ctx.onToggle }; }),
          'rect', function (k) { return !ctx.hidden.has(k); });
      }
      var notes = ['r = ' + d3.format('+.3f')(r) + ' across ' + U.precise(pts.length) + ' plotted points; the thin rule is the least-squares fit.'];
      if (t.thinned) notes.push(U.precise(t.thinned) + ' points were sampled out to keep the plot responsive.');
      if (enc.size) notes.push('Point area is ' + enc.size.label.toLowerCase() + '.');
      F.caption(host, notes.join(' '));

      var head = [enc.x.label, enc.y.label];
      if (enc.color) head.push(enc.color.label);
      if (enc.size) head.push(enc.size.label);
      return {
        columns: head,
        rows: pts.slice(0, 800).map(function (d) {
          var row = [U.compact(d.x), U.compact(d.y)];
          if (enc.color) row.push(d.c == null ? '—' : d.c);
          if (enc.size) row.push(U.compact(d.s));
          return row;
        }),
        numericFrom: 0,
        truncated: Math.max(0, pts.length - 800)
      };
    }
  };

  /* ===================== dumbbell ====================================== */

  CB.charts.dumbbell = {
    label: 'Dumbbell',
    glyph: 'M4,5 h8 M4,10 h12 M4,15 h5 M4,5 a1.5,1.5 0 1,0 0.1,0 M12,5 a1.5,1.5 0 1,0 0.1,0',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var a = S.ranked(ctx.rows, enc.x, enc.y, ctx.agg, 22);
      var bMap = new Map(S.ranked(ctx.rows, enc.x, enc.y2, ctx.agg, 0).map(function (d) { return [d.key, d.value]; }));
      var data = a.map(function (d) { return { key: d.key, a: d.value, b: bMap.get(d.key), n: d.n }; })
        .filter(function (d) { return d.a != null && d.b != null; });
      if (!data.length) { F.empty(host, 'Both measures need values in the same categories.'); return null; }
      data.sort(function (p, q) { return d3.descending(p.a, q.a); });

      var longest = d3.max(data, function (d) { return String(d.key).length; });
      var left = Math.min(240, Math.max(90, longest * 6.6 + 12));
      var f = F.make(host, {
        height: Math.max(240, Math.min(ctx.height, data.length * 30 + 66)),
        margin: { top: 14, right: 34, bottom: 40, left: left }, aria: ctx.cand.title
      });

      var y = d3.scaleBand().domain(data.map(function (d) { return d.key; })).range([0, f.h]).padding(0.4);
      var x = d3.scaleLinear()
        .domain([Math.min(0, d3.min(data, function (d) { return Math.min(d.a, d.b); })),
                 d3.max(data, function (d) { return Math.max(d.a, d.b); })])
        .nice(5).range([0, f.w]);

      F.gridX(f, x, 5);
      F.axisBottom(f, x, { ticks: 5, format: F.valueFormat(x, enc.y) });
      F.axisLeft(f, y, { tickSize: 0 }).select('.domain').attr('stroke', 'none');

      // Two shades of one hue: the pair is a before/after, not two identities.
      var cA = pal.sequential[pal.mode === 'dark' ? 10 : 8];
      var cB = pal.categorical[0];

      var g = f.g.append('g').selectAll('g').data(data).join('g')
        .attr('transform', function (d) { return 'translate(0,' + (y(d.key) + y.bandwidth() / 2) + ')'; });

      g.append('line')
        .attr('x1', function (d) { return x(d.a); }).attr('x2', function (d) { return x(d.b); })
        .attr('stroke', pal.axis).attr('stroke-width', 2).attr('stroke-linecap', 'round');
      [['a', cA, enc.y], ['b', cB, enc.y2]].forEach(function (spec) {
        g.append('circle')
          .attr('cx', function (d) { return x(d[spec[0]]); })
          .attr('r', 5).attr('fill', spec[1])
          .attr('stroke', pal.surface).attr('stroke-width', 2);
      });

      var fmt = fmtVal(enc.y, ctx.agg);
      hoverMarks(g.append('rect')
        .attr('x', 0).attr('y', -y.bandwidth() / 2)
        .attr('width', f.w).attr('height', y.bandwidth())
        .attr('fill', 'transparent'), function (d, ev) {
          F.tip.show(ev.clientX, ev.clientY, d.key, [
            { label: enc.y.label, color: cA, value: fmt(d.a) },
            { label: enc.y2.label, color: cB, value: fmt(d.b) },
            { label: 'difference', value: fmt(d.b - d.a) }
          ]);
        }, data.length);

      F.legend(host, [
        { label: enc.y.label, color: cA }, { label: enc.y2.label, color: cB }
      ], 'rect');

      return {
        columns: [enc.x.label, enc.y.label, enc.y2.label, 'Difference'],
        rows: data.map(function (d) { return [d.key, fmt(d.a), fmt(d.b), fmt(d.b - d.a)]; }),
        numericFrom: 1
      };
    }
  };

  /* ===================== slope ========================================= */

  CB.charts.slope = {
    label: 'Slope',
    glyph: 'M4,13 L16,5 M4,6 L16,10 M4,13 a1.4,1.4 0 1,0 0.1,0 M16,5 a1.4,1.4 0 1,0 0.1,0',
    render: function (host, ctx) {
      var enc = ctx.enc, pal = CB.palette.current();
      var bucket = S.timeBucket(enc.x, 24);
      var trunc = S.truncator(bucket);
      var byPeriod = d3.rollup(
        ctx.rows.filter(function (r) { return enc.x.get(r) && enc.color.get(r) != null; }),
        function (v) { return S.reduce(v.map(enc.y ? enc.y.get : function () { return 1; }), ctx.agg); },
        function (r) { return +trunc.floor(enc.x.get(r)); },
        function (r) { return enc.color.get(r); }
      );
      var periods = Array.from(byPeriod.keys()).sort(d3.ascending);
      if (periods.length < 2) { F.empty(host, 'Needs at least two periods to compare.'); return null; }
      var first = periods[0], last = periods[periods.length - 1];
      var cats = Array.from(new Set([].concat(
        Array.from(byPeriod.get(first).keys()), Array.from(byPeriod.get(last).keys())
      )));
      var data = cats.map(function (k) {
        return { key: k, a: byPeriod.get(first).get(k), b: byPeriod.get(last).get(k) };
      }).filter(function (d) { return d.a != null && d.b != null; });
      if (data.length < 2) { F.empty(host, 'Not enough categories present in both periods.'); return null; }

      var f = F.make(host, { height: ctx.height, margin: { top: 46, right: 132, bottom: 30, left: 132 }, aria: ctx.cand.title });
      var y = d3.scaleLinear()
        .domain([Math.min(0, d3.min(data, function (d) { return Math.min(d.a, d.b); })),
                 d3.max(data, function (d) { return Math.max(d.a, d.b); })])
        .nice(5).range([f.h, 0]);
      var keys = data.map(function (d) { return d.key; });
      var color = seriesColors(pal, keys.slice().sort(), 'adjacent');
      var fmt = fmtVal(enc.y, ctx.agg);
      var head = U.dateFmt(enc.x.span);

      [[0, head(new Date(first)), 'start'], [f.w, head(new Date(last)), 'end']].forEach(function (col) {
        f.g.append('line').attr('x1', col[0]).attr('x2', col[0]).attr('y1', 0).attr('y2', f.h)
          .attr('stroke', pal.axis).attr('stroke-width', 1);
        f.g.append('text').attr('x', col[0]).attr('y', -22)
          .attr('text-anchor', col[2] === 'start' ? 'start' : 'end')
          .attr('fill', pal.ink2).attr('font-size', 11).text(col[1]);
      });

      var g = f.g.append('g').selectAll('g').data(data).join('g');
      g.append('line')
        .attr('x1', 0).attr('x2', f.w)
        .attr('y1', function (d) { return y(d.a); }).attr('y2', function (d) { return y(d.b); })
        .attr('stroke', function (d) { return color(d.key); })
        .attr('stroke-width', 2).attr('stroke-linecap', 'round');
      [[0, 'a'], [f.w, 'b']].forEach(function (side) {
        g.append('circle').attr('cx', side[0])
          .attr('cy', function (d) { return y(d[side[1]]); })
          .attr('r', 4.5).attr('fill', function (d) { return color(d.key); })
          .attr('stroke', pal.surface).attr('stroke-width', 2);
      });
      g.append('text')
        .attr('x', -12).attr('y', function (d) { return y(d.a) + 4; })
        .attr('text-anchor', 'end').attr('fill', pal.ink2).attr('font-size', 11)
        .text(function (d) { return U.ellipsis(d.key, 16); });
      g.append('text')
        .attr('x', f.w + 12).attr('y', function (d) { return y(d.b) + 4; })
        .attr('fill', pal.ink2).attr('font-size', 11).attr('font-variant-numeric', 'tabular-nums')
        .text(function (d) { return fmt(d.b); });

      hoverMarks(g.append('line')
        .attr('x1', 0).attr('x2', f.w)
        .attr('y1', function (d) { return y(d.a); }).attr('y2', function (d) { return y(d.b); })
        .attr('stroke', 'transparent').attr('stroke-width', 16), function (d, ev) {
          var pct = d.a ? (d.b - d.a) / Math.abs(d.a) : null;
          F.tip.show(ev.clientX, ev.clientY, d.key, [
            { label: head(new Date(last)), color: color(d.key), value: fmt(d.b) },
            { label: head(new Date(first)), value: fmt(d.a) },
            { label: 'change', value: pct == null ? '—' : d3.format('+.1%')(pct) }
          ]);
        }, data.length);

      F.caption(host, 'First and last ' + bucket + ' in range, ' + head(new Date(first)) + ' to ' + head(new Date(last)) + '.');

      return {
        columns: [enc.color.label, head(new Date(first)), head(new Date(last)), 'Change'],
        rows: data.map(function (d) {
          return [d.key, fmt(d.a), fmt(d.b), d.a ? d3.format('+.1%')((d.b - d.a) / Math.abs(d.a)) : '—'];
        }),
        numericFrom: 1
      };
    }
  };

  CB.charts._barPath = barPath;
  CB.charts._hoverMarks = hoverMarks;
  CB.charts._seriesColors = seriesColors;
  CB.charts._fmtVal = fmtVal;
  CB.charts._yTitle = yTitle;
  CB.charts._visible = visible;
})(window.CB);
