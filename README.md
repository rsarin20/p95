# Prism

**Bring data, get the view it deserves.**

Drop a CSV, TSV or JSON file into Prism and it profiles every column, works out
which visualisations that data can actually support, ranks them, and draws the
best one — then hands you the controls to build any of the others.

It is one static page. No build step, no server, no upload: the file you drop
never leaves your browser.

---

## Run it

**The quickest way** — open `dist/prism.html` in a browser. That single file is
the whole app.

**From source**, with any static server:

```bash
python3 -m http.server 8000    # then open http://localhost:8000
```

**Rebuild the single-file bundles** after editing anything in `src/`:

```bash
node scripts/build.mjs
```

**Run the browser smoke test** — loads all three sample datasets and clicks
through every recommended view, every chart type, the filters, the table and
the column list, failing on any error or blank chart:

```bash
npm install          # playwright-core + a local d3 for the test only
node scripts/smoke.mjs
```

The app itself has **no dependencies to install** — it loads d3 v7 from a CDN
and two typefaces from Google Fonts. Everything else ships in the page.

---

## What it does

### 1. Reads almost anything tabular

CSV, TSV, semicolon- and pipe-delimited files, JSON arrays, newline-delimited
JSON, a `{data: [...]}` envelope, and GeoJSON point features. The delimiter is
sniffed by column-count consistency rather than by counting commas, quoted
fields are handled properly, and nested JSON objects are flattened one level.

You can also paste data, or give it a URL. Share links are rewritten to the raw
endpoints that actually return data — a GitHub blob URL, a Gist, a Google
Sheets link. (A URL only works where the server sends CORS headers; in a
sandboxed preview, outside requests are blocked entirely and you get a plain
message saying so. Dropping the file always works.)

### 2. Profiles every column

Each column is classified as a **measure**, a **date**, a **category**, a
**boolean**, or an **identifier**, with the statistics that go with it — range,
median, p05/p95, missing count, cardinality, balance, and a 34-step
distribution shape rendered as a sparkline in the sidebar.

The inference is deliberately careful about the things that usually go wrong:

- Dates are parsed **as UTC**, so a date column never shifts by the viewer's
  timezone offset and break day bucketing.
- `03/04/2025` is resolved **per column, not per value** — the whole column is
  scanned for a day above 12 before choosing day-first or month-first.
- A bare integer only becomes a timestamp when the column name says so, or when
  every value lands in a plausible window. Otherwise IDs stay IDs.
- `0`/`1` with two distinct values is a flag, not a measure.
- A column with a distinct value on nearly every row is an identifier, and is
  offered as a label rather than an axis.

It also **derives columns your file does not contain**: hour of day, day of
week, month and year, pulled out of any date column. That is what lets it find
a weekday-by-hour rhythm nobody put in a column.

### 3. Ranks the views the data supports

Seventeen chart forms, each with a precondition and a score. Scoring has two
halves: **fit** (does the data have the shape this chart needs, and will the
result be readable) and **reward** (how much does this view show that a plain
bar chart would not). Fit gates, reward orders, and a diversity pass stops the
gallery filling up with eight variants of the same idea.

Each recommendation says, in a sentence, **why it is worth looking at** — using
the real numbers from your file, not a template.

Some of what it looks for:

| It notices | You get |
|---|---|
| A date column with real span | Trend line, and a **calendar heatmap** if the data is daily |
| Three or more measures | **Parallel coordinates**, with axes ordered so the most-related measures sit adjacent, and a **correlation matrix** |
| Two measures | A scatter of the **strongest relationship in the file**, with its least-squares fit and r |
| A measure split by a category | A **ridgeline** of the distributions, and a **beeswarm** of the raw points |
| Two date-derived cycles | A **rhythm heatmap** — day of week against hour of day |
| A cyclic category | A **radial** chart, so December sits next to January |
| A category and something to add up | Ranked bars, grouped and stacked bars, a **treemap** |
| A date with two or more periods | A **slope chart** of first period against last |

### 4. Then lets you build anything else

The right rail is a full encoding builder: swap the chart type, change what is
on each axis, change the aggregate. Clicking a column in the sidebar drops it
into the chart on screen wherever it fits. Switching chart type carries over
whatever encoding still applies rather than resetting to blank.

---

## The rules it will not break

Prism follows a data-visualisation method rather than a taste. The parts worth
knowing, because they explain choices that might otherwise look like bugs:

- **The categorical palette is fixed and ordered.** Eight hues, assigned in a
  fixed order and never cycled. The ordering is the colourblind-safety
  mechanism, not decoration. A ninth series is never a generated hue — it folds
  into "Other".
- **Scatter, bubble and other all-pairs forms cap at three colours**, because
  past three no ordering of the eight clears the separation floors when every
  pair can end up adjacent.
- **Never a dual axis.** Two measures of different scale get two charts, or a
  dumbbell, or an indexed comparison — never two y-scales on one plot.
- **One hue, light to dark for magnitude. Two opposite hues and a neutral grey
  midpoint for polarity.** Never a rainbow, never a hue at a diverging midpoint.
- **Colour follows the entity, not its rank**, so filtering a series out never
  repaints the survivors.
- **No value ramp on nominal categories** — a ranked bar chart is one colour,
  because colouring it darker-where-bigger double-encodes the length.
- **Text never wears the data colour.** Marks carry the series colour; labels,
  values and legends use text tokens, with the colour arriving as a swatch
  beside them.
- **A label that does not fit is not drawn.** It moves outside the mark, or to
  the tooltip — never clipped, never `overflow: hidden`.
- **Tooltips enhance, they never gate.** Every chart ships a table twin with the
  exact numbers it drew, and a CSV export of the same.
- **A partial final bucket is dropped, and the chart says so.** Half a week
  plotted beside full weeks draws a cliff that is not in the data.
- **Sums only where a sum means something.** Revenue and orders add up;
  temperatures, ages and finish times do not, so those default to an average
  and are never offered as a stacked area or a treemap.

Both themes are designed, not inverted: the dark categorical steps were chosen
for the dark surface and validated as a set against it.

---

## Sample data

Three generated datasets ship with the app so it opens on a working chart
rather than an empty shell. They are **synthetic** — seeded so they are
identical on every load — and labelled as generated everywhere they appear.
Each one is built to exercise a different part of the recommender:

- **Storefront orders** — daily order lines with a seasonal swing, a weekend
  lift and steady growth. Time series, calendar, treemap, rhythm heatmap.
- **Weather stations** — three-hourly readings where the measures are genuinely
  correlated (temperature falls with elevation, pressure with it, particulates
  build in still cool air). Parallel coordinates, correlation matrix.
- **Marathon finishers** — an age curve, country effects and a second-half fade.
  Ridgeline, beeswarm, histogram, scatter.

---

## Layout

```
index.html            dev entry — loads src/ directly, no build needed
src/styles.css        design tokens and the console layout
src/js/
  util.js             formatting, seeded RNG, DOM helpers
  palette.js          the validated chart palette, both themes
  ingest.js           parsers, URL handling, the generated samples
  profile.js          type inference and per-column statistics
  shape.js            grouping, aggregation, correlation, density, thinning
  recommend.js        derived columns, scoring, the "why" copy
  frame.js            shared chart scaffolding: axes, grid, tooltip, legend
  charts-core.js      line, area, bar, columns, histogram, scatter, dumbbell, slope
  charts-rich.js      calendar, heatmap, correlation, treemap, parallel, radial,
                      ridgeline, beeswarm
  app.js              state, the console shell, filters, export
scripts/build.mjs     concatenates src/ into the two dist/ bundles
scripts/smoke.mjs     browser smoke test over every chart and dataset
dist/prism.html       the standalone single-file app
```

### Adding a chart form

1. Add a renderer to `charts-core.js` or `charts-rich.js` as
   `CB.charts.<id> = { label, glyph, render(host, ctx) }`. Return a
   `{columns, rows}` table of exactly what you drew.
2. Add its encoding slots to `SPEC` in `app.js` — the type picker and the
   builder controls are generated from that entry.
3. Add a generator to `GENERATORS` in `recommend.js` that emits a candidate
   when the data supports it, with a score and a sentence saying why.

A generator that throws is skipped rather than taking the rest down, so a new
form can never blank the app.

---

## Export

**Save chart** writes an SVG, **Save PNG** a 2× raster, **Save this table as
CSV** the exact numbers behind the current view. **Copy SVG** puts the chart on
the clipboard for pasting straight into a design tool.

In the hosted preview the page asks the viewer to confirm each save; run from a
local copy or your own deploy and it is an ordinary download.

---

## Licence

MIT — see `LICENSE`.
