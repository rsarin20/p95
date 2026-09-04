/* Prism — the recommender
 *
 * Given a profile, work out every view the data can actually support, score
 * them, and say in plain words why each one is worth looking at. Scoring has
 * two halves: FIT (does the data have the shape this chart needs, and is the
 * result readable) and REWARD (how much does this view show that a plain bar
 * chart would not). Fit gates; reward orders.
 */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var d3 = window.d3;
  var U = CB.util;
  var S = CB.shape;

  /* ---- derived fields ------------------------------------------------ */
  /* A date column secretly contains several categorical columns. Surfacing
   * them is what turns "a timestamp" into "Tuesday at 09:00". */

  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function derive(field) {
    var out = [];
    var fine = ['minute', 'hour'].indexOf(field.granularity) >= 0;
    var daily = fine || field.granularity === 'day';
    var span = field.span || 0;

    function make(suffix, cats, get, cyclicKind) {
      return {
        name: field.name + ' · ' + suffix,
        label: field.label + ' · ' + suffix,
        type: 'nominal',
        derived: true, from: field.name,
        distinct: cats.length,
        categories: cats,
        cyclic: { kind: cyclicKind, order: cats },
        rows: field.rows, missing: field.missing, count: field.count,
        get: function (row) { var d = field.get(row); return d ? get(d) : null; }
      };
    }

    if (fine) {
      var hours = d3.range(24).map(function (h) { return (h < 10 ? '0' : '') + h + ':00'; });
      out.push(make('hour of day', hours, function (d) {
        var h = d.getUTCHours(); return (h < 10 ? '0' : '') + h + ':00';
      }, 'hour'));
    }
    if (daily && span >= U.DAY * 13) {
      out.push(make('day of week', WEEKDAYS, function (d) {
        return WEEKDAYS[(d.getUTCDay() + 6) % 7];
      }, 'weekday'));
    }
    if (span >= U.DAY * 300) {
      out.push(make('month', MONTHS, function (d) { return MONTHS[d.getUTCMonth()]; }, 'month'));
    }
    if (span >= U.DAY * 400) {
      var y0 = field.min.getUTCFullYear(), y1 = field.max.getUTCFullYear();
      var years = d3.range(y0, y1 + 1).map(String);
      if (years.length <= 25) {
        out.push(make('year', years, function (d) { return String(d.getUTCFullYear()); }, 'year'));
      }
    }
    return out;
  }

  /* ---- field ranking -------------------------------------------------- */

  var MEASURE_HINT = /(revenue|sales|amount|total|value|count|qty|quantity|orders|units|spend|cost|profit|margin|score|price|duration|time|min|sec|temp|weight|size|volume|pop)/i;

  function scoreMeasure(f) {
    var s = 0;
    if (MEASURE_HINT.test(f.name)) s += 14;
    if (f.integer && f.min >= 0) s += 4;
    if (f.unit === 'currency') s += 8;
    if (f.percentLike) s -= 6;                  // a rate is rarely the headline total
    if (f.distinct < 6) s -= 12;                // reads as a code, not a measure
    if (f.missing / Math.max(1, f.rows) > 0.4) s -= 10;
    var spread = f.sd && f.mean ? Math.abs(f.sd / f.mean) : 0;
    s += Math.min(8, spread * 6);               // something actually varies here
    return s;
  }

  function scoreDim(f) {
    var s = 0;
    var k = f.distinct;
    if (k >= 3 && k <= 8) s += 16;
    else if (k === 2) s += 8;
    else if (k <= 14) s += 10;
    else if (k <= 40) s += 3;
    else s -= 8;
    if (f.balance > 0.12) s += 5;               // no single category swamping the rest
    if (f.cyclic) s += 4;
    if (f.derived) s -= 2;                      // prefer a real column when both fit
    if (f.missing / Math.max(1, f.rows) > 0.4) s -= 8;
    return s;
  }

  /* Sums only mean something for extensive quantities. Adding up temperatures,
   * ages or finish times produces a number with no referent — and a stacked
   * area or a treemap built on one is a chart that lies quietly. */
  var SUM_WORDS = ('count counts orders units qty quantity revenue sales amount amounts total totals ' +
    'spend cost costs profit gross net views clicks visits sessions impressions population volume ' +
    'weight tonnes kg litres items sold').split(' ');
  var MEAN_WORDS = ('pct percent percentage rate ratio share avg average mean median score index ' +
    'level temp temperature humidity pressure age pace price speed elevation altitude depth lat lon ' +
    'latitude longitude min mins minute minutes sec secs second seconds hours duration bmi height ' +
    'width length distance').split(' ');

  function words(name) {
    return String(name).replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z\d]+/).filter(Boolean);
  }

  function naturalAgg(f) {
    var w = words(f.name);
    if (f.percentLike) return 'mean';
    if (w.some(function (t) { return MEAN_WORDS.indexOf(t) >= 0; })) return 'mean';
    if (w.some(function (t) { return SUM_WORDS.indexOf(t) >= 0; })) return 'sum';
    // Unlabelled: whole non-negative numbers behave like counts of something.
    return f.integer && f.min >= 0 ? 'sum' : 'mean';
  }

  function summable(f) {
    return !!f && f.type === 'quantitative' && f.negatives === 0 &&
      !f.percentLike && naturalAgg(f) === 'sum';
  }

  function defaultAgg(f) {
    return f ? naturalAgg(f) : 'count';
  }

  /* ---- copy ----------------------------------------------------------- */

  var nf = function (n) { return d3.format(',')(n); };

  function aggWord(agg, measure) {
    if (agg === 'count') return 'row count';
    return (S.AGGS[agg] ? S.AGGS[agg].label.toLowerCase() : agg) + ' of ' + measure.label.toLowerCase();
  }

  function measureTitle(agg, measure) {
    if (agg === 'count' || !measure) return 'Rows';
    if (agg === 'sum') return 'Total ' + measure.label.toLowerCase();
    if (agg === 'mean') return 'Average ' + measure.label.toLowerCase();
    return U.titleCase(S.AGGS[agg].label) + ' ' + measure.label.toLowerCase();
  }

  /* ---- candidate generation ------------------------------------------- */

  function build(p) {
    var fields = p.fields;
    var times = fields.filter(function (f) { return f.type === 'temporal'; });
    var derived = [];
    times.forEach(function (t) { derived = derived.concat(derive(t)); });

    var measures = fields.filter(function (f) {
      return f.type === 'quantitative' && !f.geo;
    }).sort(function (a, b) { return scoreMeasure(b) - scoreMeasure(a); });

    var dims = fields.filter(function (f) {
      return (f.type === 'nominal' || f.type === 'boolean') && f.distinct <= 60;
    }).concat(derived).sort(function (a, b) { return scoreDim(b) - scoreDim(a); });

    times.sort(function (a, b) { return (b.distinctDates || 0) - (a.distinctDates || 0); });

    var corr = measures.length > 1
      ? S.correlations(p.rows, measures.slice(0, 10)).sort(function (a, b) { return Math.abs(b.r) - Math.abs(a.r); })
      : [];

    var ctx = {
      p: p, fields: fields, measures: measures, dims: dims, times: times,
      derived: derived, corr: corr, n: p.rowCount
    };

    var out = [];
    GENERATORS.forEach(function (g) {
      try { out = out.concat(g(ctx) || []); } catch (e) { /* a generator never blocks the rest */ }
    });

    out.forEach(function (c, i) {
      c.key = c.id + ':' + i + ':' + [c.enc.x, c.enc.y, c.enc.color, c.enc.size, c.enc.row, c.enc.col]
        .map(function (f) { return f ? f.name : '-'; }).join('|');
      c.score = Math.round(c.score);
    });
    out.sort(function (a, b) { return b.score - a.score; });

    return { candidates: diversify(out), derived: derived, corr: corr, measures: measures, dims: dims, times: times };
  }

  /* Keep the gallery from filling up with eight variants of the same chart —
   * a second view of the same family has to be clearly better to hold its place. */
  function diversify(list) {
    var seenFamily = Object.create(null);
    return list.map(function (c) {
      var fam = c.family || c.id;
      var seen = seenFamily[fam] || 0;
      seenFamily[fam] = seen + 1;
      return { c: c, adj: c.score - seen * 11 };
    }).sort(function (a, b) { return b.adj - a.adj; }).map(function (e) { return e.c; });
  }

  function cand(id, o) {
    o.id = id;
    o.enc = o.enc || {};
    return o;
  }

  var GENERATORS = [];

  /* --- trend over time --- */
  GENERATORS.push(function (c) {
    if (!c.times.length) return [];
    var t = c.times[0], out = [];
    var m = c.measures[0];
    var agg = defaultAgg(m);
    var buckets = t.distinctDates || 0;
    var quality = Math.min(14, buckets / 12);

    out.push(cand('line', {
      family: 'trend',
      title: measureTitle(agg, m) + ' over time',
      why: nf(buckets) + ' distinct points spanning ' + spanWords(t.span) +
           ' — a continuous measure against a date reads as a trend before anything else.',
      score: 84 + quality,
      enc: { x: t, y: m, agg: agg }
    }));

    var split = c.dims.filter(function (d) { return d.distinct >= 2 && d.distinct <= 8 && !d.derived; })[0]
      || c.dims.filter(function (d) { return d.distinct >= 2 && d.distinct <= 8; })[0];
    if (split && m) {
      out.push(cand('line', {
        family: 'trend',
        title: measureTitle(agg, m) + ' over time by ' + split.label.toLowerCase(),
        why: split.distinct + ' series tracked across ' + nf(buckets) + ' points — ' +
             'the comparison between ' + split.label.toLowerCase() + ' is what the dates are hiding.',
        score: 90 + quality,
        enc: { x: t, y: m, color: split, agg: agg }
      }));
      if (split.distinct <= 7) {
        var stackable = summable(m);
        out.push(cand('area', {
          family: 'composition-time',
          title: measureTitle(stackable ? 'sum' : 'count', stackable ? m : null) +
                 ' by ' + split.label.toLowerCase() + ', stacked',
          why: stackable
            ? 'Every value is positive and the parts add to a meaningful whole, so the stack shows ' +
              'both the total and each share of it moving together.'
            : 'Nothing in this file adds up to a meaningful total, so the stack counts records instead — ' +
              'the shape of activity over time, split by ' + split.label.toLowerCase() + '.',
          score: (stackable ? 82 : 70) + quality * 0.6,
          enc: { x: t, y: stackable ? m : null, color: split, agg: stackable ? 'sum' : 'count' }
        }));
      }
    }
    return out;
  });

  /* --- calendar heatmap --- */
  GENERATORS.push(function (c) {
    var t = c.times.filter(function (f) {
      return ['minute', 'hour', 'day'].indexOf(f.granularity) >= 0 && f.span >= U.DAY * 80;
    })[0];
    if (!t) return [];
    var m = c.measures[0];
    var agg = defaultAgg(m);
    var days = Math.round(t.span / U.DAY) + 1;
    return [cand('calendar', {
      family: 'calendar',
      title: measureTitle(agg, m) + ', day by day',
      why: nf(days) + ' days of daily detail — laid out as a calendar, weekly rhythm and ' +
           'seasonal drift show up in one glance without a single axis label.',
      score: 88,
      enc: { x: t, y: m, agg: agg }
    })];
  });

  /* --- parallel coordinates --- */
  GENERATORS.push(function (c) {
    var ms = c.measures.filter(function (f) { return f.distinct > 4; }).slice(0, 7);
    if (ms.length < 3) return [];
    var color = c.dims.filter(function (d) { return d.distinct >= 2 && d.distinct <= 6; })[0] || null;
    var strong = c.corr.length ? Math.abs(c.corr[0].r) : 0;
    var ordered = orderByAffinity(ms, c.corr);
    return [cand('parallel', {
      family: 'multivariate',
      title: ms.length + ' measures, one line per record',
      why: 'Each of the ' + nf(c.n) + ' records is drawn as a thread across all ' + ms.length +
           ' measures' + (color ? ', coloured by ' + color.label.toLowerCase() : '') +
           '. Axes are ordered so the most related measures sit next to each other: ' +
           'crossing threads mean an inverse relationship, parallel ones mean they move together. ' +
           'Drag on any axis to filter.',
      score: 86 + strong * 10,
      enc: { measures: ordered, color: color }
    })];
  });

  /* Axis order decides whether a parallel plot reads or just tangles. Start
   * from the strongest pair and keep appending whichever measure is most
   * related to the axis just placed. */
  function orderByAffinity(ms, corr) {
    if (ms.length < 3) return ms;
    var names = ms.map(function (m) { return m.name; });
    var r = {};
    corr.forEach(function (p) {
      if (names.indexOf(p.a.name) < 0 || names.indexOf(p.b.name) < 0) return;
      r[p.a.name + '|' + p.b.name] = Math.abs(p.r);
      r[p.b.name + '|' + p.a.name] = Math.abs(p.r);
    });
    var seed = corr.filter(function (p) { return names.indexOf(p.a.name) >= 0 && names.indexOf(p.b.name) >= 0; })[0];
    if (!seed) return ms;
    var byName = {};
    ms.forEach(function (m) { byName[m.name] = m; });
    var out = [byName[seed.a.name], byName[seed.b.name]];
    var used = { };
    used[seed.a.name] = used[seed.b.name] = true;
    while (out.length < ms.length) {
      var last = out[out.length - 1].name, best = null, bestR = -1;
      ms.forEach(function (m) {
        if (used[m.name]) return;
        var v = r[last + '|' + m.name] || 0;
        if (v > bestR) { bestR = v; best = m; }
      });
      if (!best) break;
      used[best.name] = true;
      out.push(best);
    }
    return out;
  }

  /* --- correlation matrix --- */
  GENERATORS.push(function (c) {
    var ms = c.measures.filter(function (f) { return f.distinct > 4; }).slice(0, 10);
    if (ms.length < 3) return [];
    var top = c.corr[0];
    return [cand('corrMatrix', {
      family: 'multivariate',
      title: 'How the ' + ms.length + ' measures move together',
      why: top
        ? 'Every pair scored at once. The strongest is ' + top.a.label.toLowerCase() + ' against ' +
          top.b.label.toLowerCase() + ' at r = ' + d3.format('+.2f')(top.r) + '.'
        : 'Every pair of measures scored at once.',
      score: 83,
      enc: { measures: ms }
    })];
  });

  /* --- scatter / bubble --- */
  GENERATORS.push(function (c) {
    if (c.corr.length < 1) return [];
    var out = [];
    var best = c.corr[0];
    var color = c.dims.filter(function (d) { return d.distinct >= 2 && d.distinct <= 3; })[0] || null;
    var size = c.measures.filter(function (f) {
      return f !== best.a && f !== best.b && f.min >= 0 && f.distinct > 6;
    })[0] || null;
    out.push(cand('scatter', {
      family: 'relationship',
      title: best.b.label + ' against ' + best.a.label.toLowerCase(),
      why: 'The strongest relationship in the file: r = ' + d3.format('+.2f')(best.r) + ' across ' +
           nf(best.n) + ' complete pairs' + (size ? ', with ' + size.label.toLowerCase() + ' on point size' : '') + '.',
      score: 76 + Math.abs(best.r) * 22,
      enc: { x: best.a, y: best.b, color: color, size: size }
    }));
    return out;
  });

  /* --- distribution --- */
  GENERATORS.push(function (c) {
    var out = [];
    var m = c.measures.filter(function (f) { return f.distinct > 12; })[0];
    if (!m) return [];
    var group = c.dims.filter(function (d) { return d.distinct >= 3 && d.distinct <= 12; })[0];

    if (group) {
      out.push(cand('ridgeline', {
        family: 'distribution',
        title: 'How ' + m.label.toLowerCase() + ' is distributed across ' + group.label.toLowerCase(),
        why: group.distinct + ' overlapping density curves. Averages hide shape — this shows where each ' +
             group.label.toLowerCase() + ' is bunched, spread or split in two.',
        score: 84,
        enc: { y: m, color: group }
      }));
      if (c.n <= 20000) {
        out.push(cand('beeswarm', {
          family: 'distribution',
          title: 'Every ' + singular(c.p.name || 'record') + ' by ' + m.label.toLowerCase(),
          why: 'One dot per record, nudged apart so none hide behind another, with the median marked ' +
               'per ' + group.label.toLowerCase() + '. The raw data, not a summary of it.',
          score: 80,
          enc: { y: m, color: group }
        }));
      }
    }
    out.push(cand('histogram', {
      family: 'distribution',
      title: 'Distribution of ' + m.label.toLowerCase(),
      why: 'Spread from ' + U.compact(m.min) + ' to ' + U.compact(m.max) +
           ', median ' + U.compact(m.median) + '. The shape says more than the average does.',
      score: 68,
      enc: { y: m }
    }));
    return out;
  });

  /* --- ranking --- */
  GENERATORS.push(function (c) {
    var d = c.dims.filter(function (f) { return f.distinct >= 2 && f.distinct <= 45; })[0];
    if (!d) return [];
    var m = c.measures[0];
    var agg = defaultAgg(m);
    return [cand('bar', {
      family: 'ranking',
      title: measureTitle(agg, m) + ' by ' + d.label.toLowerCase(),
      why: d.distinct + ' categories ranked on one axis — the plainest honest answer to ' +
           '"which is biggest", and the one worth checking before anything clever.',
      score: 72,
      enc: { x: d, y: m, agg: agg }
    })];
  });

  /* --- two dimensions --- */
  GENERATORS.push(function (c) {
    var out = [];
    var pairs = [];
    for (var i = 0; i < c.dims.length && pairs.length < 6; i++) {
      for (var j = 0; j < c.dims.length && pairs.length < 6; j++) {
        if (i === j) continue;
        var a = c.dims[i], b = c.dims[j];
        if (a.from && b.from && a.from === b.from && a.cyclic && b.cyclic) pairs.push([a, b]);
        else if (i < j && a.distinct * b.distinct <= 420 && a.distinct >= 2 && b.distinct >= 2) pairs.push([a, b]);
      }
    }
    if (!pairs.length) return [];
    var m = c.measures[0];
    var agg = defaultAgg(m);

    var rhythm = pairs.filter(function (pr) { return pr[0].cyclic && pr[1].cyclic; })[0];
    var pick = rhythm || pairs[0];
    out.push(cand('heatmap', {
      family: 'matrix',
      title: measureTitle(agg, m) + ': ' + pick[0].label.toLowerCase() + ' against ' + pick[1].label.toLowerCase(),
      why: rhythm
        ? 'Both axes come out of the date column, so the grid exposes the repeating rhythm — ' +
          'which ' + pick[0].label.toLowerCase() + ' and ' + pick[1].label.toLowerCase() + ' combinations run hot.'
        : (pick[0].distinct * pick[1].distinct) + ' cells, one per combination. A grid finds the hot ' +
          'and cold corners that two separate bar charts would never line up.',
      score: rhythm ? 85 : 78,
      enc: { row: pick[0], col: pick[1], y: m, agg: agg }
    }));

    var small = pairs.filter(function (pr) {
      return pr[0].distinct <= 10 && pr[1].distinct >= 2 && pr[1].distinct <= 6;
    })[0];
    if (small && m) {
      out.push(cand('groupedBar', {
        family: 'comparison',
        title: measureTitle(agg, m) + ' by ' + small[0].label.toLowerCase() + ' and ' + small[1].label.toLowerCase(),
        why: small[0].distinct + ' groups of ' + small[1].distinct + ' bars, all on one baseline, ' +
             'so both comparisons stay readable at once.',
        score: 70,
        enc: { x: small[0], color: small[1], y: m, agg: agg }
      }));
      var stack = summable(m);
      out.push(cand('stackedBar', {
        family: 'composition',
        title: measureTitle(stack ? 'sum' : 'count', stack ? m : null) +
               ' by ' + small[0].label.toLowerCase() + ', split by ' + small[1].label.toLowerCase(),
        why: 'Part-to-whole: each bar is a total for one ' + small[0].label.toLowerCase() +
             ', divided into its ' + small[1].distinct + ' ' + small[1].label.toLowerCase() + ' shares.',
        score: stack ? 72 : 64,
        enc: { x: small[0], color: small[1], y: stack ? m : null, agg: stack ? 'sum' : 'count' }
      }));
    }
    return out;
  });

  /* --- hierarchy --- */
  GENERATORS.push(function (c) {
    var levels = c.dims.filter(function (d) { return d.distinct >= 2 && d.distinct <= 22 && !d.derived; }).slice(0, 2);
    if (!levels.length) return [];
    // Nothing worth adding up? Then the share of the whole is a share of the
    // records, which is still a real part-to-whole question.
    var m = c.measures.filter(summable)[0] || null;
    var agg = m ? 'sum' : 'count';
    var cells = levels.reduce(function (a, d) { return a * d.distinct; }, 1);
    return [cand('treemap', {
      family: 'composition',
      title: measureTitle(agg, m) + ' as a share of the whole',
      why: levels.length > 1
        ? 'Nested by ' + levels[0].label.toLowerCase() + ' then ' + levels[1].label.toLowerCase() +
          ' — ' + cells + ' blocks sized by their share, so a small slice of a big group is still visible.'
        : 'Every ' + levels[0].label.toLowerCase() + ' sized by its share of the ' +
          (m ? U.compact(m.sum) : nf(c.n)) + ' total.',
      score: (m ? 74 : 66) + (levels.length > 1 ? 6 : 0),
      enc: { levels: levels, y: m, agg: agg }
    })];
  });

  /* --- cyclic / radial --- */
  GENERATORS.push(function (c) {
    var cyc = c.dims.filter(function (d) { return d.cyclic && d.distinct >= 7; })[0];
    if (!cyc) return [];
    var m = c.measures[0];
    var agg = defaultAgg(m);
    return [cand('radial', {
      family: 'cyclic',
      title: measureTitle(agg, m) + ' around the ' + (cyc.cyclic.kind === 'hour' ? 'clock' : cyc.cyclic.kind),
      why: cyc.label + ' is a cycle, not a line — it wraps. Bending the axis into a ring puts the ' +
           'end next to the beginning, which is where the pattern usually is.',
      score: 79,
      enc: { x: cyc, y: m, agg: agg }
    })];
  });

  /* --- change between two periods --- */
  GENERATORS.push(function (c) {
    if (!c.times.length) return [];
    var t = c.times[0];
    if (!t.span || t.span < U.DAY * 45) return [];
    var d = c.dims.filter(function (f) { return f.distinct >= 2 && f.distinct <= 12 && !f.derived; })[0];
    if (!d) return [];
    var m = c.measures[0];
    var agg = defaultAgg(m);
    return [cand('slope', {
      family: 'change',
      title: 'What changed, first period to last',
      why: 'Two columns and a line between them. Rank changes and crossings read instantly here ' +
           'in a way they never do on a ' + d.distinct + '-series time chart.',
      score: 77,
      enc: { x: t, y: m, color: d, agg: agg }
    })];
  });

  /* --- two measures per category --- */
  GENERATORS.push(function (c) {
    if (c.measures.length < 2) return [];
    var d = c.dims.filter(function (f) { return f.distinct >= 3 && f.distinct <= 24; })[0];
    if (!d) return [];
    var a = c.measures[0], b = c.measures[1];
    var agg = defaultAgg(a) === 'mean' || defaultAgg(b) === 'mean' ? 'mean' : 'sum';
    return [cand('dumbbell', {
      family: 'comparison',
      title: a.label + ' and ' + b.label + ' per ' + singular(d.label),
      why: 'The gap between the two dots is the point — the length of the connector is the ' +
           'difference, read directly rather than subtracted by eye from two charts.',
      score: 73,
      enc: { x: d, y: a, y2: b, agg: agg }
    })];
  });

  /* ---- helpers -------------------------------------------------------- */

  function singular(s) {
    s = String(s);
    if (/ies$/i.test(s)) return s.slice(0, -3) + 'y';
    if (/(ses|xes|zes|ches|shes)$/i.test(s)) return s.slice(0, -2);
    if (/[^s]s$/i.test(s)) return s.slice(0, -1);
    return s;
  }

  function spanWords(ms) {
    if (!ms) return 'a single moment';
    var d = ms / U.DAY;
    if (d < 1) return Math.round(ms / 36e5) + ' hours';
    if (d < 70) return Math.round(d) + ' days';
    if (d < 730) return Math.round(d / 30.44) + ' months';
    return (Math.round(d / 365.25 * 10) / 10) + ' years';
  }

  CB.recommend = {
    build: build,
    derive: derive,
    defaultAgg: defaultAgg,
    summable: summable,
    measureTitle: measureTitle,
    aggWord: aggWord,
    spanWords: spanWords
  };
})(window.CB);
