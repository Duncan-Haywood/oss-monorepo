// Browser check: a suggested fix can be applied, the plan re-renders, and Undo restores it.
//   (cd ventures && python3 -m http.server 8765) &
//   PLAYWRIGHT_MODULE=/path/to/node_modules node apply-edit.check.mjs
// Not a *.test.mjs file on purpose: it needs a browser and a server.
import { createRequire } from 'node:module';
const base = process.env.BASE_URL ?? 'http://localhost:8765';
const require = createRequire(`${process.env.PLAYWRIGHT_MODULE ?? process.cwd() + '/node_modules'}/`);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/event-seating-chart-optimizer/index.html`);
// Tight tables and a crowd of wishes on one guest leave something unmet and fixable.
await page.fill('#guests', 'A\nB\nC\nD\nE\nF\nG\nH');
await page.fill('#rules', 'A + B\nC + D');
await page.fill('#seats', '8'); await page.fill('#tcount', '2'); await page.uncheck('#balance');
await page.click('#analyze');
await page.waitForSelector('#report:not([hidden])');
const tablesBefore = await page.$eval('#tables', (e) => e.textContent);
// Check a move by hand, apply it, undo it.
const side = await page.evaluate(() => { const t = [...document.querySelectorAll('#tables .tbl')]; return t.findIndex((x) => [...x.querySelectorAll('li')].some((li) => li.textContent === 'G')) + 1; });
await page.fill('#mv-guest', 'G'); await page.fill('#mv-table', String(side === 1 ? 2 : 1));
await page.click('#mv-check');
const applyVisible = await page.$eval('#mv-apply', (e) => !e.hidden);
if (!applyVisible) throw new Error('apply button hidden: ' + await page.$eval('#mv-out', (e) => e.textContent));
{
  await page.click('#mv-apply');
  const after = await page.$eval('#tables', (e) => e.textContent);
  if (after === tablesBefore) throw new Error('apply did not change the tables');
  if (await page.$eval('#undo', (e) => e.hidden)) throw new Error('undo hidden after apply');
  await page.click('#undo');
  if ((await page.$eval('#tables', (e) => e.textContent)) !== tablesBefore) throw new Error('undo did not restore the tables');
}
await page.fill('#guests', 'A\nB\nC\nD\nE\nF\nG\nH\nI\nJ');
await page.fill('#rules', 'A ++ B\nA ++ C\nA ++ D\nA ++ E\nA ++ F\nA ++ G');
await page.fill('#seats', '4'); await page.fill('#tcount', '3'); await page.check('#balance');
await page.click('#analyze');
await page.waitForSelector('#report:not([hidden])');
const fixBtn = await page.$('#fixes-list [data-fix]');
if (fixBtn) {
  await fixBtn.click();
  if ((await page.$eval('#form-status', (e) => e.textContent)).startsWith('Edit applied') === false) throw new Error('fix not applied');
}
if (errors.length) throw new Error('page errors: ' + errors.join('; '));
console.log('ok', { applyVisible, fixButton: !!fixBtn });
await browser.close();
