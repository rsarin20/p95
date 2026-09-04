/* Prism — palette
 *
 * The chart palette is the validated instance from the dataviz method:
 * eight categorical slots stepped separately for the light and the dark
 * surface, one sequential hue, one warm/cool diverging pair with a neutral
 * grey midpoint. Slot ORDER is the colourblind-safety mechanism, not a
 * cosmetic choice — hues are assigned in fixed order and never cycled.
 */
window.CB = window.CB || {};
(function (CB) {
  'use strict';

  var LIGHT = {
    mode: 'light',
    surface: '#fcfcfb',
    plane: '#e8e7e1',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    rule: '#d7d6ce',
    categorical: [
      '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
      '#e87ba4', '#008300', '#4a3aa7', '#e34948'
    ],
    // Sequential: one hue, light -> dark. Steps 100..700 of the blue ramp.
    sequential: [
      '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec',
      '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab',
      '#184f95', '#104281', '#0d366b'
    ],
    // Ordinal ramps must clear 2:1 against the surface — start at step 250.
    ordinalFrom: 3,
    diverging: { low: '#184f95', mid: '#f0efec', high: '#d03b3b' },
    status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
    deemphasis: '#c3c2b7'
  };

  var DARK = {
    mode: 'dark',
    surface: '#1a1a19',
    plane: '#0d0d0d',
    ink: '#ffffff',
    ink2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    rule: '#2c2c2a',
    categorical: [
      '#3987e5', '#d95926', '#199e70', '#c98500',
      '#d55181', '#008300', '#9085e9', '#e66767'
    ],
    sequential: [
      '#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf',
      '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef',
      '#9ec5f4', '#b7d3f6', '#cde2fb'
    ],
    ordinalFrom: 3,
    diverging: { low: '#86b6ef', mid: '#383835', high: '#e66767' },
    status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
    deemphasis: '#52514e'
  };

  /* All-pairs forms (scatter, bubble, small multiples) cannot seat more than
   * three categorical slots without failing the separation floors. Adjacent
   * forms (stacks, bars, lines) hold all eight. Callers ask for the cap that
   * matches their form and fold the tail into "Other". */
  CB.palette = {
    LIGHT: LIGHT,
    DARK: DARK,
    capFor: function (form) { return form === 'all-pairs' ? 3 : 8; },

    /** The palette matching whatever theme the document is resolving to now. */
    current: function () {
      var stamp = document.documentElement.getAttribute('data-theme');
      if (stamp === 'dark') return DARK;
      if (stamp === 'light') return LIGHT;
      var m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      return m && m.matches ? DARK : LIGHT;
    },

    /** Continuous magnitude -> one hue, light to dark. */
    sequentialScale: function (pal, domain) {
      return window.d3.scaleQuantize().domain(domain).range(pal.sequential);
    },

    /** Ordered discrete steps — never lighter than the 2:1 floor. */
    ordinal: function (pal, n) {
      var start = pal.ordinalFrom;
      var avail = pal.sequential.length - start;
      var out = [];
      for (var i = 0; i < n; i++) {
        out.push(pal.sequential[start + Math.round((i / Math.max(1, n - 1)) * (avail - 1))]);
      }
      return out;
    },

    /** Polarity around a meaningful zero: two opposite hues, neutral middle. */
    divergingScale: function (pal, max) {
      return window.d3.scaleLinear()
        .domain([-max, 0, max])
        .range([pal.diverging.low, pal.diverging.mid, pal.diverging.high])
        .clamp(true);
    },

    /* Colour follows the entity, never its rank: the scale is built once from
     * the full domain so filtering a series out never repaints the survivors. */
    categoricalScale: function (pal, domain, form) {
      var cap = CB.palette.capFor(form);
      return window.d3.scaleOrdinal()
        .domain(domain.slice(0, cap))
        .range(pal.categorical.slice(0, cap))
        .unknown(pal.deemphasis);
    }
  };
})(window.CB);
