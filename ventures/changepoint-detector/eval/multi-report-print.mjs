// Headless-Chromium print check of the several-column branded report (multi-report.mjs) on wide data.
// For each case it builds the report in Node, loads it in Chromium with print media emulated at the
// printable width of an A4 page with 15 mm margins (180 x 267 mm = 680 x 1009 CSS px), and measures:
//   - wide: the widest table or chart's width against the printable width (wider is clipped in print:
//     the joint table sits in a sideways-scrolling box that a printer cannot scroll);
//   - tall: the tallest chart against the printable height (a chart is one unbreakable image, so a taller
//     one runs off the page);
// then prints a real A4 PDF and reports its page count. Cases: the real seven-column UK road-casualty series
// (data/uk-road-casualties.csv, Rdatasets Seatbelts, both models), and synthetic 12- and 20-column series.
// Run: node eval/multi-report-print.mjs   (needs the playwright package)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseColumns, analyzeMulti } from '../multivariate.mjs';
import { multiReportHtml } from '../multi-report.mjs';

const W = 680, H = 1009;
const road = readFileSync(new URL('../data/uk-road-casualties.csv', import.meta.url), 'utf8');
function synthetic(d, n = 240) {
  let seed = 11;
  const u = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const rows = ['t,' + Array.from({ length: d }, (_, k) => `sensor_${k + 1}`).join(',')];
  for (let i = 0; i < n; i++) rows.push(`p${i},` + Array.from({ length: d }, (_, k) => ((i >= 80 + 7 * k ? 3 : 0) + 100 * k + u() * 2).toFixed(3)).join(','));
  return rows.join('\n');
}
const cases = [
  ['UK road casualties, 7 columns, level', road, 'mean'],
  ['UK road casualties, 7 columns, level and volatility', road, 'meanvar'],
  ['synthetic, 12 columns, level', synthetic(12), 'mean'],
  ['synthetic, 20 columns, level and volatility', synthetic(20), 'meanvar'],
];
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
let failed = 0;
try {
  for (const [name, csv, model] of cases) {
    const p = parseColumns(csv);
    const html = multiReportHtml(p, analyzeMulti({ ...p, model }), { title: name, author: 'Print check', date: '2026-11-11' });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html);
    const m = await page.evaluate(() => {
      const widths = [...document.querySelectorAll('table, svg')].map((e) => Math.ceil(e.getBoundingClientRect().width));
      const boxes = [...document.querySelectorAll('div')].filter((d) => d.scrollWidth > d.clientWidth + 1).length;
      const svgs = [...document.querySelectorAll('svg')].map((e) => Math.ceil(e.getBoundingClientRect().height));
      const tables = [...document.querySelectorAll('table')].map((t) => Math.ceil(t.scrollWidth));
      return { widest: Math.max(...widths, ...tables), clippedBoxes: boxes, tallest: Math.max(...svgs), charts: svgs.length, tables: tables.length };
    });
    const pdf = await page.pdf({ format: 'A4', margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    const wideOk = m.widest <= W && m.clippedBoxes === 0, tallOk = m.tallest <= H;
    if (!wideOk || !tallOk) failed++;
    console.log(`${wideOk && tallOk ? 'ok  ' : 'FAIL'}  ${name}: widest ${m.widest} px of ${W}${m.clippedBoxes ? ` (${m.clippedBoxes} box${m.clippedBoxes > 1 ? 'es' : ''} scroll sideways)` : ''}; tallest chart ${m.tallest} px of ${H}; ${m.charts} chart${m.charts > 1 ? 's' : ''}, ${m.tables} tables; ${pages} A4 pages`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(failed ? `${failed} case(s) do not fit the printed page` : 'every case fits the printed page');
process.exitCode = failed ? 1 : 0;
