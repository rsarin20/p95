/* Prism — profiling
 *
 * Reads raw parsed rows and works out what each column actually is: a measure,
 * a date, a category, an identifier. Every downstream decision — which charts
 * are even possible, what goes on which axis — is made from this profile, so
 * the inference is deliberately conservative and records its own confidence.
 */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var d3 = window.d3;
  var U = CB.util;

  var CURRENCY = /[$€£¥₹₽¢]/g;
  var TRUE_WORDS = ['true', 'yes', 'y', 't'];
  var FALSE_WORDS = ['false', 'no', 'n', 'f'];

  function blank(v) {
    return v == null || v === '' ||
      (typeof v === 'string' && (v.trim() === '' || /^(na|n\/a|null|nan|none|-|—)$/i.test(v.trim())));
  }

  /* ---- scalar coercion ---------------------------------------------- */

  function toNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (!s) return null;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }      // (1,234) accounting negative
    var pct = /%$/.test(s);
    s = s.replace(/%$/, '').replace(CURRENCY, '').replace(/\s/g, '');
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');  // 1,234,567.89
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
    var n = Number(s);
    if (!Number.isFinite(n)) return null;
    if (neg) n = -n;
    return pct ? n : n;
  }

  var ISO = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;
  var SLASH = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/;
  var DOTTED = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

  /** Parsed as UTC throughout: a date column read in local time silently shifts
   *  every point by the viewer's offset and breaks day bucketing. */
  function toDate(v, fmt) {
    if (v instanceof Date) return Number.isNaN(+v) ? null : v;
    if (typeof v === 'number') return fmt === 'epoch_s' ? new Date(v * 1000)
      : fmt === 'epoch_ms' ? new Date(v) : null;
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (!s) return null;
    var m;
    if ((m = s.match(ISO))) {
      if (m[7]) { var t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t); }
      return new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1), +(m[4] || 0), +(m[5] || 0), Math.floor(+(m[6] || 0))));
    }
    if ((m = s.match(SLASH))) {
      if (m[1].length === 4) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      var a = +m[1], b = +m[2];
      var day = fmt === 'dmy' ? a : b, mon = fmt === 'dmy' ? b : a;
      var yr = +m[3]; if (yr < 100) yr += yr < 70 ? 2000 : 1900;
      if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
      return new Date(Date.UTC(yr, mon - 1, day));
    }
    if ((m = s.match(DOTTED))) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (fmt === 'epoch_s' && /^\d{9,11}$/.test(s)) return new Date(+s * 1000);
    if (fmt === 'epoch_ms' && /^\d{12,14}$/.test(s)) return new Date(+s);
    return null;
  }

  /** Decide the column's date format once, from the whole column, rather than
   *  guessing per value — 03/04 is only unambiguous in company. */
  function detectDateFormat(values, name) {
    var iso = 0, slash = 0, dotted = 0, dmyEvidence = 0, mdyEvidence = 0, n = 0;
    for (var i = 0; i < values.length; i++) {
      var s = values[i];
      if (typeof s !== 'string') continue;
      s = s.trim(); if (!s) continue;
      n++;
      var m;
      if (ISO.test(s)) iso++;
      else if ((m = s.match(SLASH))) {
        slash++;
        if (m[1].length !== 4) {
          if (+m[1] > 12) dmyEvidence++;
          if (+m[2] > 12) mdyEvidence++;
        }
      } else if (DOTTED.test(s)) dotted++;
    }
    if (!n) return null;
    var hits = iso + slash + dotted;
    if (hits / n >= 0.9) {
      if (iso >= slash && iso >= dotted) return 'iso';
      if (slash >= dotted) return dmyEvidence > mdyEvidence ? 'dmy' : 'mdy';
      return 'dmy';
    }
    // Bare epochs are only read as time when the column name says so, or every
    // value lands in a plausible window — otherwise IDs become dates.
    var timeName = /(^|[_\s.])(date|time|ts|timestamp|epoch|at|created|updated|day|month|week)([_\s.]|$)/i.test(name);
    var allDigits = 0, sec = 0, ms = 0;
    for (var j = 0; j < values.length; j++) {
      var t = String(values[j]).trim();
      if (/^\d{9,11}$/.test(t)) { allDigits++; sec++; }
      else if (/^\d{12,14}$/.test(t)) { allDigits++; ms++; }
    }
    if (allDigits / n >= 0.95 && (timeName || n > 20)) {
      if (ms >= sec) return 'epoch_ms';
      var yrs = values.slice(0, 50).map(function (x) { return new Date(+x * 1000).getUTCFullYear(); });
      if (yrs.every(function (y) { return y >= 1980 && y <= 2100; })) return 'epoch_s';
    }
    return null;
  }

  /* ---- column profile ------------------------------------------------ */

  var CYCLIC = {
    month: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
    weekday: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  };

  function cyclicOrder(values) {
    var low = values.map(function (v) { return String(v).trim().toLowerCase().slice(0, 3); });
    var keys = Object.keys(CYCLIC);
    for (var i = 0; i < keys.length; i++) {
      var seq = CYCLIC[keys[i]];
      var hit = low.filter(function (v) { return seq.indexOf(v) >= 0; }).length;
      if (hit / low.length > 0.9) {
        return { kind: keys[i], order: values.slice().sort(function (a, b) {
          return seq.indexOf(String(a).trim().toLowerCase().slice(0, 3)) -
                 seq.indexOf(String(b).trim().toLowerCase().slice(0, 3));
        }) };
      }
    }
    return null;
  }

  function quantile(sorted, p) {
    if (!sorted.length) return null;
    var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  function profileColumn(name, raw, rowCount) {
    var present = [];
    for (var i = 0; i < raw.length; i++) if (!blank(raw[i])) present.push(raw[i]);
    var missing = rowCount - present.length;

    var f = {
      name: name, label: U.titleCase(name),
      type: 'nominal', missing: missing, count: present.length, rows: rowCount
    };

    if (!present.length) { f.type = 'empty'; f.distinct = 0; return f; }

    var uniq = new Set();
    for (var u = 0; u < present.length && uniq.size <= 5000; u++) uniq.add(String(present[u]));
    f.distinct = uniq.size;
    var uniqList = Array.from(uniq);

    if (f.distinct === 1) { f.type = 'constant'; f.constant = uniqList[0]; return f; }

    // Boolean before number, so 0/1 flags don't become measures.
    var lows = uniqList.map(function (v) { return String(v).trim().toLowerCase(); });
    if (f.distinct === 2) {
      var isBool = lows.every(function (v) {
        return TRUE_WORDS.indexOf(v) >= 0 || FALSE_WORDS.indexOf(v) >= 0 || v === '0' || v === '1';
      });
      if (isBool) {
        f.type = 'boolean';
        f.categories = uniqList;
        f.counts = tally(present);
        return f;
      }
    }

    // Temporal.
    var dfmt = detectDateFormat(present.slice(0, 400), name);
    if (dfmt) {
      var dates = [], ok = 0;
      for (var k = 0; k < present.length; k++) {
        var dv = toDate(present[k], dfmt);
        if (dv) { dates.push(dv); ok++; }
      }
      if (ok / present.length >= 0.9 && dates.length > 1) {
        dates.sort(function (a, b) { return a - b; });
        f.type = 'temporal';
        f.format = dfmt;
        f.min = dates[0]; f.max = dates[dates.length - 1];
        f.span = +f.max - +f.min;
        var deltas = [];
        for (var q = 1; q < Math.min(dates.length, 600); q++) {
          var dd = +dates[q] - +dates[q - 1];
          if (dd > 0) deltas.push(dd);
        }
        deltas.sort(d3.ascending);
        f.step = deltas.length ? quantile(deltas, 0.5) : null;
        f.distinctDates = new Set(dates.map(function (x) { return +x; })).size;
        f.granularity = !f.step ? 'irregular'
          : f.step < 36e5 ? 'minute' : f.step < U.DAY * 0.9 ? 'hour'
          : f.step < U.DAY * 6 ? 'day' : f.step < U.DAY * 26 ? 'week'
          : f.step < U.DAY * 200 ? 'month' : 'year';
        f.histogram = histogram(dates.map(Number), 34);
        return f;
      }
    }

    // Quantitative.
    var nums = [], numOK = 0;
    for (var p = 0; p < present.length; p++) {
      var nv = toNumber(present[p]);
      if (nv != null) { nums.push(nv); numOK++; }
    }
    if (numOK / present.length >= 0.9 && nums.length > 1) {
      var sorted = nums.slice().sort(d3.ascending);
      f.type = 'quantitative';
      f.min = sorted[0];
      f.max = sorted[sorted.length - 1];
      f.mean = d3.mean(nums);
      f.median = quantile(sorted, 0.5);
      f.p05 = quantile(sorted, 0.05);
      f.p95 = quantile(sorted, 0.95);
      f.sd = nums.length > 1 ? d3.deviation(nums) : 0;
      f.sum = d3.sum(nums);
      f.integer = nums.every(Number.isInteger);
      f.negatives = nums.filter(function (x) { return x < 0; }).length;
      f.zeros = nums.filter(function (x) { return x === 0; }).length;
      f.histogram = histogram(nums, 34);
      f.percentLike = /(pct|percent|rate|share|ratio|%)/i.test(name) || (f.min >= 0 && f.max <= 100 && /pct|percent/i.test(name));
      f.unit = /(^|[_\s])(usd|eur|gbp|revenue|price|cost|sales|amount|spend)([_\s]|$)/i.test(name) ? 'currency' : null;
      f.isID = f.integer && f.distinct === present.length && present.length > 12 &&
        /(^|[_\s.])(id|bib|key|no|num|number|code|index|row)([_\s.]|$)/i.test(name);
      if (f.isID) { f.type = 'key'; }
      if (/^(lat|latitude)$/i.test(name) && f.min >= -90 && f.max <= 90) f.geo = 'lat';
      if (/^(lon|lng|long|longitude)$/i.test(name) && f.min >= -180 && f.max <= 180) f.geo = 'lon';
      return f;
    }

    // Categorical or free text. The cut is cardinality relative to row count:
    // a column with a distinct value on nearly every row is an identifier, not
    // a dimension you can colour or group by.
    var ratio = f.distinct / present.length;
    var avgLen = d3.mean(present.slice(0, 300), function (v) { return String(v).length; });
    if (f.distinct > 60 && (ratio > 0.55 || avgLen > 42)) {
      f.type = 'key';
      f.avgLength = avgLen;
      return f;
    }
    f.type = 'nominal';
    f.counts = tally(present);
    f.categories = f.counts.map(function (c) { return c.key; });
    f.cyclic = f.distinct <= 12 ? cyclicOrder(f.categories) : null;
    f.balance = f.counts.length ? f.counts[f.counts.length - 1].n / f.counts[0].n : 1;
    return f;
  }

  function tally(values) {
    var m = new Map();
    for (var i = 0; i < values.length; i++) {
      var k = String(values[i]);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m, function (e) { return { key: e[0], n: e[1] }; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  function histogram(nums, bins) {
    var lo = d3.min(nums), hi = d3.max(nums);
    if (lo === hi) return [{ x0: lo, x1: hi, n: nums.length }];
    var out = new Array(bins).fill(0);
    var w = (hi - lo) / bins;
    for (var i = 0; i < nums.length; i++) {
      var b = Math.min(bins - 1, Math.floor((nums[i] - lo) / w));
      out[b]++;
    }
    return out.map(function (n, i) { return { x0: lo + i * w, x1: lo + (i + 1) * w, n: n }; });
  }

  /** Typed accessor for a field — used by every chart so coercion happens once. */
  function accessor(field) {
    if (field.type === 'temporal') {
      var fmt = field.format;
      return function (row) { return toDate(row[field.name], fmt); };
    }
    if (field.type === 'quantitative') {
      return function (row) { return toNumber(row[field.name]); };
    }
    return function (row) {
      var v = row[field.name];
      return blank(v) ? null : String(v);
    };
  }

  function profile(rows) {
    var cols = rows.columns || (rows.length ? Object.keys(rows[0]) : []);
    var fields = cols.map(function (c) {
      var raw = new Array(rows.length);
      for (var i = 0; i < rows.length; i++) raw[i] = rows[i][c];
      return profileColumn(c, raw, rows.length);
    });
    fields.forEach(function (f) { f.get = accessor(f); });
    return {
      rows: rows,
      rowCount: rows.length,
      fields: fields,
      by: function (name) { return fields.filter(function (f) { return f.name === name; })[0]; },
      ofType: function () {
        var want = Array.prototype.slice.call(arguments);
        return fields.filter(function (f) { return want.indexOf(f.type) >= 0; });
      }
    };
  }

  CB.profile = {
    run: profile,
    toNumber: toNumber,
    toDate: toDate,
    blank: blank,
    tally: tally
  };
})(window.CB);
