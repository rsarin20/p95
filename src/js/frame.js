/* Prism — chart frame
 *
 * The scaffolding every chart shares: a sized SVG, hairline axes and grid, one
 * tooltip, one legend builder, one empty state. Charts get to be about their
 * marks because the chrome is decided here, once.
 */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var d3 = window.d3;
  var U = CB.util;

  /* ---- tooltip -------------------------------------------------------- */

  var tipNode = null;

  function tipEl() {
    if (!tipNode) {
      tipNode = U.el('div', { class: 'tip', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(tipNode);
    }
    return tipNode;
  }

  /** rows: [{label, value, color}] — the value leads, the series name follows.
   *  Everything goes in as text: category names are untrusted input. */
  function tipShow(x, y, head, rows) {
    var n = tipEl();
    U.clear(n);
    if (head) n.appendChild(U.el('div', { class: 'tip-head', text: String(head) }));
    var body = U.el('div', { class: 'tip-rows' });
    (rows || []).forEach(function (r) {
      var row = U.el('div', { class: 'tip-row' });
      if (r.color) row.appendChild(U.el('span', { class: 'tip-key', style: 'background:' + r.color }));
      row.appendChild(U.el('span', { class: 'tip-val', text: r.value == null ? '—' : String(r.value) }));
      if (r.label) row.appendChild(U.el('span', { class: 'tip-lab', text: String(r.label) }));
      body.appendChild(row);
    });
    n.appendChild(body);
    n.classList.add('is-on');
    place(n, x, y);
  }

  function place(n, x, y) {
    var pad = 14;
    var r = n.getBoundingClientRect();
    var left = x + pad, top = y + pad;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
    n.style.transform = 'translate(' + Math.max(6, left) + 'px,' + Math.max(6, top) + 'px)';
  }

  function tipHide() { if (tipNode) tipNode.classList.remove('is-on'); }

  /* ---- frame ---------------------------------------------------------- */

  function make(host, opts) {
    opts = opts || {};
    var pal = CB.palette.current();
    var box = host.getBoundingClientRect();
    var W = Math.max(320, Math.floor(box.width || 900));
    var H = Math.max(260, Math.floor(opts.height || box.height || 480));
    var m = Object.assign({ top: 18, right: 24, bottom: 40, left: 60 }, opts.margin);
    var w = Math.max(40, W - m.left - m.right);
    var h = Math.max(40, H - m.top - m.bottom);

    var svg = d3.select(host).append('svg')
      .attr('class', 'chart')
      .attr('viewBox', '0 0 ' + W + ' ' + H)
      .attr('width', W).attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', opts.aria || 'Chart');

    if (opts.desc) svg.append('desc').text(opts.desc);

    var g = svg.append('g').attr('transform', 'translate(' + m.left + ',' + m.top + ')');
    return { svg: svg, g: g, W: W, H: H, w: w, h: h, m: m, pal: pal, host: host };
  }

  /* ---- axes ----------------------------------------------------------- */

  function styleAxis(sel, pal) {
    sel.select('.domain').attr('stroke', pal.axis).attr('stroke-width', 1);
    sel.selectAll('.tick line').attr('stroke', pal.axis).attr('stroke-width', 1);
    sel.selectAll('.tick text').attr('fill', pal.muted).attr('font-size', 11).attr('class', 'tick-text');
    return sel;
  }

  function gridX(f, scale, ticks) {
    var g = f.g.append('g').attr('class', 'grid');
    g.selectAll('line').data(scale.ticks ? scale.ticks(ticks || 6) : scale.domain())
      .join('line')
      .attr('x1', function (d) { return scale(d); })
      .attr('x2', function (d) { return scale(d); })
      .attr('y1', 0).attr('y2', f.h)
      .attr('stroke', f.pal.grid).attr('stroke-width', 1).attr('shape-rendering', 'crispEdges');
    return g;
  }

  function gridY(f, scale, ticks) {
    var g = f.g.append('g').attr('class', 'grid');
    g.selectAll('line').data(scale.ticks ? scale.ticks(ticks || 5) : scale.domain())
      .join('line')
      .attr('y1', function (d) { return scale(d); })
      .attr('y2', function (d) { return scale(d); })
      .attr('x1', 0).attr('x2', f.w)
      .attr('stroke', f.pal.grid).attr('stroke-width', 1).attr('shape-rendering', 'crispEdges');
    return g;
  }

  function axisBottom(f, scale, o) {
    o = o || {};
    var ax = d3.axisBottom(scale).tickSize(o.tickSize == null ? 5 : o.tickSize).tickPadding(8);
    if (o.ticks) ax.ticks(o.ticks);
    if (o.format) ax.tickFormat(o.format);
    if (o.values) ax.tickValues(o.values);
    var g = f.g.append('g').attr('class', 'axis axis-x')
      .attr('transform', 'translate(0,' + f.h + ')').call(ax);
    styleAxis(g, f.pal);
    if (o.rotate) {
      g.selectAll('.tick text')
        .attr('transform', 'rotate(-38)').attr('text-anchor', 'end')
        .attr('dx', '-0.5em').attr('dy', '0.5em');
    }
    if (o.label) {
      f.g.append('text').attr('class', 'axis-label')
        .attr('x', f.w).attr('y', f.h + f.m.bottom - 6)
        .attr('text-anchor', 'end').attr('fill', f.pal.muted).attr('font-size', 11)
        .text(o.label);
    }
    return g;
  }

  function axisLeft(f, scale, o) {
    o = o || {};
    var ax = d3.axisLeft(scale).tickSize(o.tickSize == null ? 5 : o.tickSize).tickPadding(8);
    if (o.ticks) ax.ticks(o.ticks);
    if (o.format) ax.tickFormat(o.format);
    if (o.values) ax.tickValues(o.values);
    var g = f.g.append('g').attr('class', 'axis axis-y').call(ax);
    styleAxis(g, f.pal);
    if (o.label) {
      f.g.append('text').attr('class', 'axis-label')
        .attr('x', 0).attr('y', -6)
        .attr('text-anchor', 'start').attr('fill', f.pal.muted).attr('font-size', 11)
        .text(o.label);
    }
    return g;
  }

  /** Tick formatter for a value axis — clean round numbers, thousands-comma'd. */
  function valueFormat(scale, field) {
    var span = Math.abs(scale.domain()[1] - scale.domain()[0]);
    var base = span >= 1e6 ? d3.format('~s')
      : span >= 1000 ? d3.format(',.0f')
      : span >= 10 ? d3.format(',.0f')
      : span >= 1 ? d3.format(',.1f') : d3.format(',.2f');
    return function (v) {
      var s = base(v).replace('G', 'B');
      return field && field.percentLike ? s + '%' : s;
    };
  }

  /* ---- legend --------------------------------------------------------- */

  /** kind: 'line' mirrors a line chart's mark, 'rect' a bar or area's. */
  function legend(host, items, kind, active) {
    var wrap = U.el('div', { class: 'legend' });
    items.forEach(function (it) {
      var on = !active || active(it.label);
      var b = U.el('button', {
        class: 'legend-item' + (on ? '' : ' is-off'),
        type: 'button',
        'aria-pressed': on ? 'true' : 'false',
        title: it.note || it.label
      }, [
        U.el('span', { class: 'legend-key legend-key--' + (kind || 'rect'), style: 'background:' + it.color }),
        U.el('span', { class: 'legend-label', text: it.label })
      ]);
      if (it.onToggle) b.addEventListener('click', function () { it.onToggle(it.label); });
      else b.disabled = true;
      wrap.appendChild(b);
    });
    host.appendChild(wrap);
    return wrap;
  }

  function caption(host, text) {
    host.appendChild(U.el('p', { class: 'chart-note', text: text }));
  }

  function empty(host, message) {
    U.clear(host);
    host.appendChild(U.el('div', { class: 'chart-empty' }, [
      U.el('p', { text: message })
    ]));
  }

  /* ---- interaction helpers ------------------------------------------- */

  /** A vertical hairline that snaps to the nearest x — readers aim at a date,
   *  never at a 2px line. */
  function crosshair(f) {
    var line = f.g.append('line')
      .attr('class', 'crosshair')
      .attr('y1', 0).attr('y2', f.h)
      .attr('stroke', f.pal.ink2).attr('stroke-width', 1)
      .attr('opacity', 0).attr('pointer-events', 'none');
    return {
      at: function (x) { line.attr('x1', x).attr('x2', x).attr('opacity', 0.45); },
      off: function () { line.attr('opacity', 0); },
      node: line
    };
  }

  /** A transparent capture rect covering the plot — bigger than any mark. */
  function capture(f) {
    return f.g.append('rect')
      .attr('class', 'capture')
      .attr('width', f.w).attr('height', f.h)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');
  }

  /** Marks get keyboard focus only where the count stays navigable; past that
   *  the table view is the non-pointer path (and is always present). */
  function focusable(sel, count, onFocus, onBlur) {
    if (count > 80) return sel;
    return sel.attr('tabindex', 0).attr('role', 'listitem')
      .on('focus', onFocus).on('blur', onBlur || tipHide);
  }

  function centerOf(node) {
    var r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  CB.frame = {
    make: make,
    axisBottom: axisBottom, axisLeft: axisLeft,
    gridX: gridX, gridY: gridY,
    valueFormat: valueFormat,
    legend: legend, caption: caption, empty: empty,
    crosshair: crosshair, capture: capture,
    focusable: focusable, centerOf: centerOf,
    tip: { show: tipShow, hide: tipHide }
  };
})(window.CB);
