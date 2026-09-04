/* Build the single-file bundles from src/.
 *
 *   node scripts/build.mjs
 *
 * Produces two files from exactly the same source:
 *   dist/prism.html           a complete standalone page — open it, host it, deploy it
 *   dist/prism.artifact.html  the same page as a fragment (no doctype/head/body),
 *                             which is the shape the Claude Artifact publisher wants
 *
 * There is no transpiling and no minifying: the source is plain browser
 * JavaScript in load order, so the bundle stays readable and debuggable.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const SCRIPTS = [
  'src/js/util.js',
  'src/js/palette.js',
  'src/js/ingest.js',
  'src/js/profile.js',
  'src/js/shape.js',
  'src/js/recommend.js',
  'src/js/frame.js',
  'src/js/charts-core.js',
  'src/js/charts-rich.js',
  'src/js/app.js'
];

const D3 = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js';
const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

const css = read('src/styles.css');
const js = SCRIPTS.map((p) => `/* ===== ${p} ===== */\n${read(p)}`).join('\n');

const body = `<div id="app"></div>
<script src="${D3}"></script>
<script>
${js}
</script>`;

const head = `<title>Prism</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>`;

mkdirSync(join(root, 'dist'), { recursive: true });

// The artifact publisher wraps the file in its own doctype/head/body skeleton,
// so this variant carries the head contents inline and nothing else.
writeFileSync(join(root, 'dist/prism.artifact.html'), `${head}\n${body}\n`);

writeFileSync(join(root, 'dist/prism.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Bring a CSV, TSV or JSON file and Prism profiles every column, then ranks and draws the richest views the data actually supports.">
${head}
</head>
<body>
${body}
</body>
</html>
`);

const bytes = (p) => (readFileSync(join(root, p)).length / 1024).toFixed(0);
console.log(`dist/prism.html            ${bytes('dist/prism.html')} KB`);
console.log(`dist/prism.artifact.html   ${bytes('dist/prism.artifact.html')} KB`);
