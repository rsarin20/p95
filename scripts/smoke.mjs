/* Smoke test: drive the real UI in a real browser.
 *
 *   node scripts/smoke.mjs
 *
 * Loads every sample dataset, clicks every recommended view and every chart
 * type in the builder, and fails on any page error, console error, or chart
 * that renders nothing. d3 is served from node_modules so the test needs no
 * network. Not a substitute for looking at it — a guard against shipping a
 * chart that throws on some shape of data.
 */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

// Point d3 at the local copy rather than the CDN. A function replacement,
// never a string: minified sources are full of `$` sequences that a string
// replacement would silently expand.
const page_html = readFileSync(join(root, 'dist/prism.html'), 'utf8').replace(
  /<script src="https:\/\/cdnjs[^"]*"><\/script>/,
  () => '<script src="../node_modules/d3/dist/d3.min.js"></script>'
);
const tmp = join(root, 'dist/.smoke.html');
writeFileSync(tmp, page_html);

const problems = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });

let where = 'boot';
page.on('pageerror', (e) => problems.push(`[${where}] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.googleapis|ERR_/.test(m.text())) {
    problems.push(`[${where}] console: ${m.text()}`);
  }
});

await page.goto('file://' + tmp);
await page.waitForSelector('.card svg.chart', { timeout: 15000 });

const samples = await page.$$eval('.sample .sample-name', (n) => n.map((x) => x.textContent));
let checks = 0;

async function drawn(label) {
  await page.waitForTimeout(140);
  const state = await page.evaluate(() => ({
    svg: !!document.querySelector('.plot svg.chart'),
    empty: !!document.querySelector('.plot .chart-empty'),
    msg: (document.querySelector('.plot .chart-empty p') || {}).textContent || ''
  }));
  checks++;
  if (!state.svg && !state.empty) problems.push(`[${label}] nothing rendered at all`);
  return state;
}

for (const sample of samples) {
  where = sample;
  await page.click(`.sample:has(.sample-name:text-is("${sample}"))`);
  await page.waitForSelector('.card svg.chart, .plot .chart-empty', { timeout: 15000 });

  // The gallery re-renders on every pick, so handles go stale — re-query by
  // index each time rather than holding them.
  const viewCount = await page.$$eval('.gallery .view', (n) => n.length);
  for (let i = 0; i < viewCount; i++) {
    const view = page.locator('.gallery .view').nth(i);
    const title = await view.locator('.view-title').textContent();
    where = `${sample} › view "${title}"`;
    await view.click();
    const st = await drawn(where);
    if (st.empty) console.log(`  · empty: ${where} — ${st.msg.slice(0, 70)}`);
  }

  const forms = await page.$$eval('.form-btn .form-label', (n) => n.map((x) => x.textContent));
  for (const form of forms) {
    where = `${sample} › form "${form}"`;
    await page.click(`.form-btn:has(.form-label:text-is("${form}"))`);
    const st = await drawn(where);
    if (st.empty) console.log(`  · empty: ${where} — ${st.msg.slice(0, 70)}`);
  }

  where = `${sample} › table`;
  await page.click('.table-toggle');
  await page.waitForTimeout(120);
  const rows = await page.$$eval('.data-table tbody tr', (n) => n.length);
  if (!rows) problems.push(`[${where}] table view rendered no rows`);
  await page.click('.table-toggle');

  where = `${sample} › filters`;
  if (await page.$('.chips .chip-btn')) {
    await page.locator('.chips .chip-btn').first().click();
    await drawn(where);
    await page.locator('.chips .chip-btn').first().click();
    await drawn(where);
  }
  if ((await page.$$eval('.seg-btn', (n) => n.length)) > 1) {
    await page.locator('.seg-btn').nth(1).click();
    await drawn(where);
    await page.locator('.seg-btn').nth(0).click();
    await drawn(where);
  }

  where = `${sample} › columns`;
  const colCount = await page.$$eval('.field-row', (n) => n.length);
  for (let i = 0; i < colCount; i++) {
    const name = await page.locator('.field-row .field-name').nth(i).textContent();
    where = `${sample} › column "${name}"`;
    await page.locator('.field-row').nth(i).click();
    await drawn(where);
  }
}

where = 'theme';
for (const _ of [0, 1, 2]) {
  await page.click('.bar-actions .btn:last-child');
  await drawn('theme cycle');
}

where = 'paste';
await page.click('.paste summary');
await page.fill('.paste textarea', 'city,year,visitors,rating\nOslo,2023,1200,4.2\nOslo,2024,1500,4.4\nLima,2023,900,3.9\nLima,2024,1100,4.1\nCairo,2023,2100,4.6\nCairo,2024,1950,4.5');
await page.click('.paste .btn--solid');
await page.waitForTimeout(500);
await drawn('pasted data');

await page.screenshot({ path: join(root, 'dist/.smoke.png'), fullPage: false });
await browser.close();

console.log(`\n${checks} renders checked across ${samples.length} datasets.`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  [...new Set(problems)].slice(0, 40).forEach((p) => console.log('  ✗ ' + p));
  process.exit(1);
}
console.log('No page errors, console errors, or blank charts.');
