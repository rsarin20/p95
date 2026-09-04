/* Prism — ingest
 *
 * Everything that becomes a dataset goes through one door: text in, rows out.
 * Sample data is generated as CSV text and parsed by the same code path as a
 * dropped file, so there is no privileged input.
 */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var d3 = window.d3;
  var U = CB.util;

  /* ---- parsing ------------------------------------------------------ */

  function stripBOM(t) { return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t; }

  /** Sniff the delimiter by which candidate gives the most consistent column
   *  count across the first few lines — more reliable than counting commas. */
  function sniff(text) {
    var lines = text.split(/\r\n|\n|\r/).filter(function (l) { return l.trim(); }).slice(0, 12);
    if (!lines.length) return ',';
    var best = ',', bestScore = -1;
    [',', '\t', ';', '|'].forEach(function (d) {
      var counts = lines.map(function (l) { return splitLine(l, d).length; });
      var n = counts[0];
      if (n < 2) return;
      var consistent = counts.filter(function (c) { return c === n; }).length;
      var score = consistent * 100 + n;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }

  function splitLine(line, delim) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function parseDelimited(text) {
    text = stripBOM(text);
    var delim = sniff(text);
    var rows = d3.dsvFormat(delim).parse(text);
    var cols = (rows.columns || []).map(function (c, i) {
      var name = String(c == null ? '' : c).trim();
      return name || ('column_' + (i + 1));
    });
    // d3 keeps the raw header text as the key; re-key onto the cleaned names.
    var raw = rows.columns || [];
    var out = rows.map(function (r) {
      var o = {};
      raw.forEach(function (k, i) { o[cols[i]] = r[k]; });
      return o;
    });
    out.columns = dedupe(cols);
    return out;
  }

  function dedupe(names) {
    var seen = Object.create(null);
    return names.map(function (n) {
      if (!(n in seen)) { seen[n] = 1; return n; }
      return n + '_' + (++seen[n]);
    });
  }

  /** Accepts an array of objects, {data|rows|results|records|items: [...]},
   *  or newline-delimited JSON. Nested objects are flattened one level. */
  function parseJSON(text) {
    text = stripBOM(text).trim();
    var val;
    try {
      val = JSON.parse(text);
    } catch (e) {
      var lines = text.split(/\r\n|\n/).filter(function (l) { return l.trim(); });
      val = lines.map(function (l) { return JSON.parse(l); });
    }
    if (!Array.isArray(val)) {
      var keys = ['data', 'rows', 'results', 'records', 'items', 'values', 'features'];
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(val && val[keys[i]])) { val = val[keys[i]]; break; }
      }
    }
    if (!Array.isArray(val)) throw new Error('That JSON has no array of records in it.');
    if (val.length && val[0] && val[0].type === 'Feature' && val[0].properties) {
      val = val.map(function (f) {
        var p = Object.assign({}, f.properties);
        var g = f.geometry;
        if (g && g.type === 'Point' && Array.isArray(g.coordinates)) {
          p.longitude = g.coordinates[0]; p.latitude = g.coordinates[1];
        }
        return p;
      });
    }
    var cols = [];
    var rows = val.map(function (r) {
      var flat = {};
      if (r == null || typeof r !== 'object') { flat.value = r; }
      else {
        Object.keys(r).forEach(function (k) {
          var v = r[k];
          if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            Object.keys(v).forEach(function (k2) { flat[k + '.' + k2] = scalar(v[k2]); });
          } else {
            flat[k] = scalar(v);
          }
        });
      }
      Object.keys(flat).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
      return flat;
    });
    rows.forEach(function (r) { cols.forEach(function (c) { if (!(c in r)) r[c] = ''; }); });
    rows.columns = cols;
    return rows;
  }

  function scalar(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }

  function parseText(text, hint) {
    var t = text.replace(/^\s+/, '');
    var looksJSON = t[0] === '[' || t[0] === '{';
    if (hint === 'json' || (hint !== 'csv' && looksJSON)) {
      try { return parseJSON(text); } catch (e) { if (hint === 'json') throw e; }
    }
    var rows = parseDelimited(text);
    if (!rows.length || !rows.columns.length) throw new Error('No rows found. Expected CSV, TSV or JSON.');
    return rows;
  }

  /* ---- sources ------------------------------------------------------ */

  function fromFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var hint = /\.json(l|lines)?$/i.test(file.name) ? 'json'
            : /\.(csv|tsv|txt|psv)$/i.test(file.name) ? 'csv' : null;
          var rows = parseText(String(r.result), hint);
          res({ rows: rows, name: file.name.replace(/\.[^.]+$/, ''), origin: 'file' });
        } catch (e) { rej(e); }
      };
      r.onerror = function () { rej(new Error('That file could not be read.')); };
      r.readAsText(file);
    });
  }

  /** Rewrite the share links people actually have into the raw endpoints that
   *  return data — the single most common reason a paste "doesn't work". */
  function normalizeURL(url) {
    url = url.trim();
    var m;
    if ((m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/))) {
      return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3];
    }
    if ((m = url.match(/^https:\/\/gist\.github\.com\/([^/]+)\/([0-9a-f]+)$/))) {
      return 'https://gist.githubusercontent.com/' + m[1] + '/' + m[2] + '/raw';
    }
    if ((m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)/))) {
      var gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
      return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv'
        + (gid ? '&gid=' + gid : '');
    }
    return url;
  }

  function fromURL(url) {
    var target = normalizeURL(url);
    return fetch(target, { credentials: 'omit', redirect: 'follow' })
      .then(function (r) {
        if (!r.ok) throw new Error('The server answered ' + r.status + ' ' + r.statusText + '.');
        var ct = r.headers.get('content-type') || '';
        return r.text().then(function (t) {
          return { text: t, hint: /json/.test(ct) ? 'json' : /csv|plain|tab/.test(ct) ? 'csv' : null };
        });
      })
      .then(function (res) {
        var rows = parseText(res.text, res.hint);
        var name = decodeURIComponent(target.split('/').pop().split('?')[0]).replace(/\.[^.]+$/, '');
        return { rows: rows, name: name || 'Remote data', origin: 'url' };
      })
      .catch(function (e) {
        if (e instanceof TypeError) {
          throw new Error(
            'The browser blocked that request. A page can only read a URL that ' +
            'sends CORS headers, and the hosted preview blocks outside requests ' +
            'entirely. Download the file and drop it in instead — that always works.'
          );
        }
        throw e;
      });
  }

  /* ---- generated sample data ---------------------------------------- */
  /* Synthetic, seeded, and labelled as such everywhere it surfaces. It exists
   * so the app opens on a working chart rather than an empty shell. */

  function csv(header, rows) {
    var esc = function (v) {
      v = String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return header.join(',') + '\n' + rows.map(function (r) { return r.map(esc).join(','); }).join('\n');
  }

  var iso = d3.utcFormat('%Y-%m-%d');
  var isoMin = d3.utcFormat('%Y-%m-%dT%H:%M');
  var count = function (rows) { return d3.format(',')(rows.length); };

  function storefront() {
    var r = U.rng(20260904);
    var regions = ['North America', 'Latin America', 'Europe', 'Middle East', 'Asia Pacific'];
    var regionWeight = [1.0, 0.42, 0.78, 0.31, 0.66];
    var cats = ['Outerwear', 'Footwear', 'Accessories', 'Knitwear', 'Denim', 'Bags'];
    var catWeight = [1.0, 0.85, 0.55, 0.7, 0.62, 0.4];
    var channels = ['Retail store', 'Web', 'Wholesale'];
    var rows = [];
    var start = Date.UTC(2024, 0, 1);
    for (var d = 0; d < 550; d++) {
      var t = start + d * U.DAY;
      var day = new Date(t);
      var doy = d % 365;
      // A year-long seasonal swing, a weekend lift, and steady growth.
      var season = 1 + 0.42 * Math.sin((doy / 365) * 2 * Math.PI - 1.9);
      var weekend = [0, 6].indexOf(day.getUTCDay()) >= 0 ? 1.28 : 1;
      var growth = 1 + d * 0.0009;
      // Every region trades every day: a region that only appears in a
      // scattering of days produces a jagged line that says nothing.
      for (var ri = 0; ri < regions.length; ri++) {
        var picks = 2 + Math.floor(r() * 2);
        for (var k = 0; k < picks; k++) {
          var ci = Math.floor(r() * cats.length);
          var ch = U.pick(r, channels);
          var base = 46 * regionWeight[ri] * catWeight[ci] * season * weekend * growth;
          var orders = Math.max(1, Math.round(base * (0.82 + r() * 0.36)));
          var aov = 58 + catWeight[ci] * 96 + U.gauss(r) * 11;
          var revenue = orders * Math.max(18, aov);
          var margin = 0.28 + catWeight[ci] * 0.16 + U.gauss(r) * 0.045
            - (ch === 'Wholesale' ? 0.11 : 0);
          rows.push([
            iso(day), regions[ri], cats[ci], ch, orders,
            revenue.toFixed(2), (margin * 100).toFixed(1),
            (revenue / orders).toFixed(2)
          ]);
        }
      }
    }
    return {
      id: 'storefront',
      label: 'Storefront orders',
      blurb: count(rows) + ' daily order lines · date, region, category, channel, revenue',
      text: csv(['date', 'region', 'category', 'channel', 'orders', 'revenue', 'margin_pct', 'avg_order_value'], rows)
    };
  }

  function stations() {
    var r = U.rng(7731);
    var names = ['Cairngorm', 'Blackrock', 'Fairhaven', 'Ridgeway', 'Saltmarsh', 'Kestrel Hill'];
    var elev = [1245, 82, 15, 640, 4, 910];
    var rows = [];
    var start = Date.UTC(2025, 8, 1);
    for (var h = 0; h < 340; h++) {
      var t = start + h * 3 * 36e5;
      var dt = new Date(t);
      var hourOfDay = dt.getUTCHours();
      var diurnal = Math.sin(((hourOfDay - 4) / 24) * 2 * Math.PI);
      for (var s = 0; s < names.length; s++) {
        var lapse = elev[s] * 0.0062;
        var temp = 17.5 - lapse + diurnal * (5.4 - elev[s] * 0.0009) + U.gauss(r) * 1.15;
        // Humidity runs against temperature; pressure falls with elevation.
        var hum = Math.min(99, Math.max(22, 74 - (temp - 12) * 2.6 + U.gauss(r) * 6));
        var pres = 1013 - elev[s] * 0.1128 + U.gauss(r) * 3.4;
        var wind = Math.max(0, 6 + elev[s] * 0.0085 + U.gauss(r) * 5.5);
        // Fine particulates build in still, cool, low-lying air.
        var pm = Math.max(1.2, 21 - wind * 1.15 - (elev[s] * 0.0052) + (hum - 60) * 0.14 + U.gauss(r) * 3.6);
        rows.push([
          isoMin(dt), names[s], elev[s],
          temp.toFixed(2), hum.toFixed(1), pres.toFixed(1),
          wind.toFixed(1), pm.toFixed(1)
        ]);
      }
    }
    return {
      id: 'stations',
      label: 'Weather stations',
      blurb: count(rows) + ' three-hourly readings · 6 stations, 5 correlated measures',
      text: csv(['reading_at', 'station', 'elevation_m', 'temp_c', 'humidity_pct', 'pressure_hpa', 'wind_kph', 'pm25'], rows)
    };
  }

  function marathon() {
    var r = U.rng(42195);
    var countries = ['Kenya', 'Ethiopia', 'United Kingdom', 'United States', 'Japan', 'Germany', 'Brazil', 'Spain'];
    var cWeight = [-16, -14, 1.5, 2.2, 0.4, 1.1, 3.0, 1.8];
    var waves = ['Elite', 'Wave 1', 'Wave 2', 'Wave 3', 'Wave 4'];
    var waveOffset = [-32, -6, 6, 19, 34];
    var rows = [];
    for (var i = 0; i < 1400; i++) {
      var ci = Math.floor(Math.pow(r(), 1.9) * countries.length);
      var wi = Math.min(waves.length - 1, Math.floor(Math.pow(r(), 0.7) * waves.length));
      var sex = r() < 0.57 ? 'M' : 'F';
      var age = Math.round(Math.max(18, Math.min(74, 38 + U.gauss(r) * 11)));
      // Age curve: fastest around 30, slowing away from it in both directions.
      var ageCost = Math.pow(Math.max(0, age - 30), 1.42) * 0.42 + Math.max(0, 26 - age) * 0.9;
      var finish = 172 + cWeight[ci] + waveOffset[wi] + ageCost
        + (sex === 'F' ? 11 : 0) + U.gauss(r) * 12;
      finish = Math.max(126, finish);
      // Nearly everyone runs the second half slower; the fade grows with the time.
      var fade = 0.5 + (finish - 150) * 0.0021 + Math.max(0, U.gauss(r) * 0.028);
      var half = finish * Math.min(0.52, Math.max(0.44, 1 - fade));
      rows.push([
        1000 + i, age, sex, countries[ci], waves[wi],
        half.toFixed(1), finish.toFixed(1), (finish / 42.195).toFixed(2)
      ]);
    }
    return {
      id: 'marathon',
      label: 'Marathon finishers',
      blurb: count(rows) + ' finishers · age, country, wave, split and finish times',
      text: csv(['bib', 'age', 'sex', 'country', 'start_wave', 'half_min', 'finish_min', 'pace_min_per_km'], rows)
    };
  }

  var SAMPLE_BUILDERS = { storefront: storefront, stations: stations, marathon: marathon };
  var sampleCache = {};

  function sampleMeta() {
    return ['storefront', 'stations', 'marathon'].map(function (id) {
      var s = sample(id);
      return { id: id, label: s.label, blurb: s.blurb };
    });
  }

  function sample(id) {
    if (!sampleCache[id]) sampleCache[id] = SAMPLE_BUILDERS[id]();
    return sampleCache[id];
  }

  function fromSample(id) {
    var s = sample(id);
    return { rows: parseText(s.text, 'csv'), name: s.label, origin: 'sample' };
  }

  CB.ingest = {
    parseText: parseText,
    parseDelimited: parseDelimited,
    parseJSON: parseJSON,
    fromFile: fromFile,
    fromURL: fromURL,
    normalizeURL: normalizeURL,
    fromSample: fromSample,
    sampleMeta: sampleMeta,
    sampleText: function (id) { return sample(id).text; }
  };
})(window.CB);
