/* Prism — small shared utilities. No dependencies beyond d3. */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var d3 = window.d3;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;       // labels are untrusted data
        else if (k === 'html') n.innerHTML = v;         // only ever for our own literals
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
        else if (k === 'style') n.setAttribute('style', v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* ---- number & date formatting ------------------------------------ */

  var siFmt = d3.format('.3~s');

  function compact(v) {
    if (v == null || Number.isNaN(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e4) return siFmt(v).replace('G', 'B');
    if (a >= 1) return d3.format(',.4~f')(v);
    if (a === 0) return '0';
    if (a < 1e-4) return d3.format('.2~e')(v);
    return d3.format(',.4~f')(v);
  }

  function precise(v) {
    if (v == null || Number.isNaN(v)) return '—';
    return Number.isInteger(v) ? d3.format(',')(v) : d3.format(',.4~f')(v);
  }

  var DAY = 864e5;
  function dateFmt(span) {
    if (span == null) return d3.utcFormat('%Y-%m-%d');
    if (span < DAY) return d3.utcFormat('%H:%M');
    if (span < DAY * 3) return d3.utcFormat('%b %d %H:%M');
    if (span < DAY * 365 * 2) return d3.utcFormat('%b %d, %Y');
    return d3.utcFormat('%Y');
  }

  function tickDateFmt(span) {
    if (span < DAY) return d3.utcFormat('%H:%M');
    if (span < DAY * 90) return d3.utcFormat('%b %d');
    if (span < DAY * 365 * 3) return d3.utcFormat('%b %Y');
    return d3.utcFormat('%Y');
  }

  /* Truncate for an axis or a chip — never for a tooltip or a table cell,
   * where the full value has to stay reachable. */
  function ellipsis(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* ---- seeded RNG (sample data must be identical on every load) ----- */

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(r) {
    var u = 1 - r(), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  /* ---- misc -------------------------------------------------------- */

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** A transition that collapses to an instant set when motion is reduced. */
  function ease(sel, ms) {
    return reducedMotion() ? sel : sel.transition().duration(ms == null ? 420 : ms).ease(d3.easeCubicOut);
  }

  function titleCase(s) {
    return String(s)
      .replace(/[_\-.]+/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, function (c) { return c.toUpperCase(); });
  }

  CB.util = {
    el: el, clear: clear,
    compact: compact, precise: precise,
    dateFmt: dateFmt, tickDateFmt: tickDateFmt,
    ellipsis: ellipsis, titleCase: titleCase,
    rng: rng, gauss: gauss, pick: pick,
    debounce: debounce, ease: ease, reducedMotion: reducedMotion,
    DAY: DAY
  };
})(window.CB);
