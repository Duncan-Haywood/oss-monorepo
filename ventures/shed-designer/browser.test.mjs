// The editor driven in a real browser, as a first-time visitor would on a
// laptop and on a phone: drags, arrow keys, touch, typing, undo and redo, and
// no console errors along the way.
//
// Skips when Playwright cannot be loaded. Set PLAYWRIGHT to its entry file
// (.../node_modules/playwright/index.js), and AXE to axe-core's axe.min.js for
// the accessibility check; the shed-designer CI workflow sets both.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDesign } from './model.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT, '/opt/node-tools/node_modules/playwright/index.js'].filter(Boolean);
  for (const p of tries) {
    if (!existsSync(/** @type {string} */ (p))) continue;
    try { return createRequire(import.meta.url)(/** @type {string} */ (p)); } catch { /* try the next */ }
  }
  try { return createRequire(import.meta.url)('playwright'); } catch { return null; }
}
const pw = loadPlaywright();
const skip = pw ? false : 'Playwright not found (set PLAYWRIGHT to its index.js)';
const AXE = process.env.AXE && existsSync(process.env.AXE) ? process.env.AXE : null;

const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png' };
let server; let base; let browser;

before(async () => {
  if (skip) return;
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path === '' ? 'index.html' : path);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
});
after(async () => { await browser?.close(); server?.close(); });

/** A fresh page with an error log; fails the test if anything was logged as an error. */
// These tests edit the 8x12 default (model.mjs defaultDesign), so each page
// starts with it saved. A first-time visitor opens on the gallery's balanced
// design instead (gallery-ui.mjs firstDesign; the test below checks that view).
const START_FROM_DEFAULT = `try { if (!localStorage.getItem('shed-designer-state-v1')) localStorage.setItem('shed-designer-state-v1', ${JSON.stringify(JSON.stringify({ designs: [defaultDesign()], active: 0 }))}); } catch {}`;

async function open(t, ctxOpts = { viewport: { width: 1366, height: 900 } }) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(START_FROM_DEFAULT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no console errors'); });
  return { ctx, page };
}
const val = (page, id) => page.$eval(`#${id}`, (e) => e.value);
const center = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));

test('dragging the length handle resizes in 6" steps and undo restores it', { skip }, async (t) => {
  const { page } = await open(t);
  assert.equal(await val(page, 'lengthFt'), '12');
  const [x, y] = await center(page.locator('#plan [data-key="plan-len"]'));
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 6 }); await page.mouse.up();
  const len = Number(await val(page, 'lengthFt'));
  assert.ok(len > 12, `length grew (${len})`);
  assert.equal((len * 12) % 6, 0, 'snapped to 6"');
  await page.click('#undo');
  assert.equal(await val(page, 'lengthFt'), '12');
  await page.keyboard.press('Control+Shift+Z');
  assert.equal(await val(page, 'lengthFt'), String(len), 'Ctrl+Shift+Z redoes');
  await page.click('#undo');
  await page.keyboard.press('Control+y');
  assert.equal(await val(page, 'lengthFt'), String(len), 'Ctrl+Y redoes');
});

test('every handle works from the keyboard and keeps focus after the redraw', { skip }, async (t) => {
  const { page } = await open(t);
  const h = page.locator('#plan [data-key="plan-len"]');
  await h.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await val(page, 'lengthFt'), '12.5');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-key')), 'plan-len', 'focus survives the redraw');
  await page.keyboard.press('Shift+ArrowLeft');
  assert.equal(await val(page, 'lengthFt'), '10.5');
  await page.locator('#plan [data-key="plan-wid"]').focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(await val(page, 'widthFt'), '8.5');

  const door = page.locator('#plan [data-key^="op-"]').first();
  const before = Number(await page.$eval('#openings input[data-k="offset"]', (e) => e.value));
  await door.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(Number(await page.$eval('#openings input[data-k="offset"]', (e) => e.value)), before + 1);

  const pitch = Number(await val(page, 'pitch'));
  await page.locator('#endview [data-key="end-peak"]').focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(Number(await val(page, 'pitch')), pitch + 1);
  assert.equal(await page.$eval('#autoPitch', (e) => e.checked), false, 'a chosen pitch turns the automatic pitch off');

  await page.locator('#endview [data-key="end-eave"]').focus();
  const oh = Number(await val(page, 'overhang'));
  await page.keyboard.press('ArrowLeft');
  assert.equal(Number(await val(page, 'overhang')), oh + 1);
});

test('a steep peak drag grows the end view as it goes, keeping the peak in sight', { skip }, async (t) => {
  const { page } = await open(t);
  const peak = page.locator('#endview [data-key="end-peak"]');
  await page.locator('#endview').scrollIntoViewIfNeeded();
  const start = await peak.boundingBox();
  const x = start.x + start.width / 2; let y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const heights = [];
  for (let i = 0; i < 12; i++) {
    y -= 25;
    await page.mouse.move(x, y);
    await settle(page);
    const [box, dot, vb] = await page.evaluate(() => {
      const svg = document.querySelector('#endview');
      const h = svg.querySelector('[data-key="end-peak"]').getBoundingClientRect();
      const b = svg.getBoundingClientRect();
      return [[b.top, b.bottom], [h.top + h.height / 2], svg.getAttribute('viewBox')];
    });
    heights.push(Number(vb.split(' ')[3]));
    assert.ok(dot[0] >= box[0] && dot[0] <= box[1], `step ${i}: the peak (${dot[0]}) stays inside the view (${box})`);
  }
  await page.mouse.up();
  assert.ok(heights.at(-1) > heights[0], `the view grew during the drag: ${heights.join(', ')}`);
  await page.waitForFunction(() => document.querySelector('#pitch').value === '14');
});

test('the end view draws the roof that is built, not the number under an automatic box', { skip }, async (t) => {
  const { page } = await open(t);
  await page.check('#autoPitch'); await page.check('#autoOverhang');
  await settle(page);
  const built = await page.$eval('#live', (e) => e.textContent);
  const m = /(\d+)\/12 roof, (\d+)" overhang/.exec(built);
  assert.ok(m, built);
  const label = await page.$$eval('#endview text', (ts) => ts.map((x) => x.textContent));
  assert.ok(label.includes(`${m[1]}/12`), `end view pitch ${label} matches built ${m[1]}/12`);
  assert.ok(label.includes(`${m[2]}"`), `end view overhang ${label} matches built ${m[2]}"`);
});

test('dragging the eave sets the overhang even with the automatic overhang ticked', { skip }, async (t) => {
  const { page } = await open(t);
  await page.check('#autoOverhang');
  const before = Number(await val(page, 'overhang'));
  const [x, y] = await center(page.locator('#endview [data-key="end-eave"]'));
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 25, y, { steps: 5 }); await page.mouse.up();
  const after = Number(await val(page, 'overhang'));
  assert.ok(after > before, `overhang ${before} -> ${after}`);
  assert.equal(await page.$eval('#autoOverhang', (e) => e.checked), false);
});

test('typing a number is one undo step and never builds the half-typed value', { skip }, async (t) => {
  const { page } = await open(t);
  await page.evaluate(() => {
    /** @type {any} */ (window).seen = [];
    new MutationObserver(() => /** @type {any} */ (window).seen.push(document.querySelector('#live').textContent)).observe(document.querySelector('#live'), { childList: true, characterData: true, subtree: true });
  });
  await page.click('#lengthFt', { clickCount: 3 });
  await page.keyboard.type('16');
  await page.waitForFunction(() => document.querySelector('#live').textContent.startsWith("16'"));
  const seen = await page.evaluate(() => /** @type {any} */ (window).seen);
  assert.ok(!seen.some((s) => /^(0|1|4)' 0" x/.test(s)), `no half-typed shed was built: ${seen.join(' | ')}`);
  await page.keyboard.press('Tab');
  await page.click('#undo');
  assert.equal(await val(page, 'lengthFt'), '12', 'one undo goes back to before the typing');
  assert.equal(await page.$eval('#undo', (b) => b.disabled), true);
});

test('a cleared number box keeps the last value instead of meaning 0', { skip }, async (t) => {
  const { page } = await open(t);
  const total = await page.textContent('#total');
  const wall = await val(page, 'wallHeight');
  await page.click('#wallHeight', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Tab');
  assert.equal(await val(page, 'wallHeight'), wall, 'the wall height comes back');
  await page.click('#lengthFt', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Tab');
  assert.equal(await val(page, 'lengthFt'), '12', 'the length comes back');
  const width = 'input[data-i="0"][data-k="width"]';
  const w = await page.$eval(width, (e) => e.value);
  await page.click(width, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Tab');
  assert.equal(await page.$eval(width, (e) => e.value), w, 'the opening width comes back');
  assert.equal(await page.textContent('#total'), total, 'nothing was rebuilt');
  assert.equal(await page.$eval('#undo', (b) => b.disabled), true, 'no undo step');
});

test('a site-built door too short for its Z brace says so', { skip }, async (t) => {
  const { page } = await open(t);
  const height = 'input[data-i="0"][data-k="height"]';
  assert.equal(await page.$eval('select[data-i="0"][data-k="product"]', (e) => e.value), 'site-built');
  await page.fill(height, '24');
  await page.press(height, 'Tab');
  await page.waitForFunction(() => document.querySelector('#warnings').textContent.includes('Z brace'));
  assert.match(await page.textContent('#warnings'), /Z brace runs at \d+ deg/);
  assert.equal(await page.$eval('select[data-i="0"][data-k="product"]', (e) => e.value), 'site-built', 'a new size keeps the site-built door');
});

test('the page explains the siding price step and that undo is per design', { skip }, async (t) => {
  const { page } = await open(t);
  await page.fill('#lengthFt', '10');
  await page.press('#lengthFt', 'Tab');
  await page.waitForFunction(() => !document.querySelector('#undo').disabled);
  await page.selectOption('#new-design', '8x8 lean');
  assert.match(await page.textContent('#status'), /Undo and redo start fresh for each design/);
  assert.equal(await page.$eval('#undo', (b) => b.disabled), true);
  // The siding note shows only where taller walls are cheaper: an 8x12 lean-to at 112".
  await page.selectOption('#new-design', '8x12 lean-to');
  await page.fill('#wallHeight', '112');
  await page.press('#wallHeight', 'Tab');
  await page.waitForFunction(() => document.querySelector('#wallHeight').value === '112' && /4x8-and-strip/.test(document.querySelector('#notes').textContent));
  assert.match(await page.textContent('#notes'), /Siding: each 4 ft column takes the shortest panel .*4x10 \$\d+\.\d\d/);
});


test('a custom-size opening shows a catalogue range, and counts it only when ticked', { skip }, async (t) => {
  const { page } = await open(t);
  await page.selectOption('#new-design', '8x12 classic');
  await page.waitForFunction(() => /typical range \$246\.00 to \$615\.00/.test(document.querySelector('#shopping').textContent));
  const before = await page.textContent('#total');
  await page.check('#customRange');
  await page.waitForFunction((b) => document.querySelector('#total').textContent !== b, before);
  const row = await page.$$eval('#shopping tbody tr', (rows) => rows.map((r) => r.textContent).find((x) => /Door 38" x 82".*counted at the median/.test(x)));
  assert.ok(row, 'the door is a line of its own');
  assert.match(row, /estimate/);
  assert.doesNotMatch(await page.textContent('#shopping'), /Not in the total/);
});

test('on a phone the total stays in view while you edit, and the plan boxes do not stretch on a laptop', { skip }, async (t) => {
  const { page } = await open(t, { ...pw.devices['Pixel 7'] });
  const pill = page.locator('#total-pill');
  await page.locator('#endview').scrollIntoViewIfNeeded();
  assert.equal(await page.textContent('#total-pill-n'), await page.textContent('#total'));
  const top = await pill.boundingBox();
  assert.ok(top.y >= 0 && top.y < 80, `the total sits in the bar at the top (${top.y})`);
  await pill.click();
  await page.waitForFunction(() => { const r = document.querySelector('#summary').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }, null, { timeout: 5000 });
  // Laptop: the plan's box ends near its drawing instead of stretching to the 3D column's height.
  const { page: desk } = await open(t);
  const [planSec, svg] = await desk.evaluate(() => [document.querySelector('#plan').closest('section').getBoundingClientRect().height, document.querySelector('#plan').getBoundingClientRect().height]);
  assert.ok(planSec < svg + 160, `plan section ${planSec} px for a ${svg} px drawing`);
});

test('the section bar opens each results tab, and a left-out line comes off the total', { skip }, async (t) => {
  const { page } = await open(t);
  assert.match(await page.textContent('#total-scope'), /Materials, sales tax and delivery only/);
  await page.click('#jump [data-jump="panel-plans"]');
  await page.waitForFunction(() => !document.querySelector('#panel-plans').hidden);
  await page.waitForFunction(() => { const r = document.querySelector('#results-h').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }, null, { timeout: 5000 });
  await page.click('#jump [data-jump="panel-shopping"]');
  const total = await page.textContent('#total');
  const line = await page.$eval('#shopping input[data-skip]', (cb) => { const tr = cb.closest('tr'); return { name: cb.dataset.skip, total: tr.children[4].textContent }; });
  await page.check(`#shopping input[data-skip="${line.name}"]`);
  await page.waitForFunction((b) => document.querySelector('#total').textContent !== b, total);
  const num = (x) => Number(x.replace(/[$,]/g, ''));
  const drop = num(total) - num(await page.textContent('#total'));
  const rate = Number(await page.inputValue('#taxRate'));
  assert.ok(Math.abs(drop - num(line.total) * (1 + rate / 100)) < 0.02, `the total fell by the line and its tax (${drop})`);
  assert.equal(await page.$eval(`#shopping input[data-skip="${line.name}"]`, (cb) => cb.closest('tr').className), 'skip');
  assert.match(await page.textContent('#summary-lines'), /you have or left out/);
  assert.match(await page.textContent('#shopping'), /PT 4x4 x \d+'(Show in 3D)?for skid/, 'lumber lines say what they are for');
  assert.match(await page.textContent('#shopping'), /Lumber subtotal \(\d+% of the materials\)\$[\d,]+\.\d\d/, 'each section has a subtotal');
  assert.match(await page.textContent('#summary-lines'), /Where the money goes.*Lumber \$/);
  assert.match(await page.textContent('#cuts'), /\d+ ft → .*\(\w+\)/, 'cut sheet boards say what they are cut into');
});

test('each option and each design card says what it changes and what it costs against yours', { skip }, async (t) => {
  const { page } = await open(t);
  await page.click('#make-options');
  await page.waitForSelector('#option-cards article');
  const cards = await page.$$eval('#option-cards article', (as) => as.map((a) => a.textContent));
  const ridge = cards.find((c) => /Ridge board with rafter ties/.test(c));
  assert.match(ridge, /roof ridge beam on posts → ridge board with rafter ties/);
  assert.match(ridge, /\+\d+ rafter tie/);
  assert.match(ridge, /\$[\d,.]+ less/);
  await page.selectOption('#new-design', '8x12 classic');
  await page.click('#design-tabs [data-design="0"]');
  await page.waitForFunction(() => /Against the one you're editing/.test(document.querySelector('#compare-cards').textContent));
  assert.match(await page.textContent('#compare-cards'), /walls [^→]+ → 8' 0"/);
});

test('each door and window says what it costs in all', { skip }, async (t) => {
  const { page } = await open(t);
  await page.waitForFunction(() => [...document.querySelectorAll('#openings td[data-cost]')].every((td) => /^\$/.test(td.textContent)));
  const cells = await page.$$eval('#openings td[data-cost]', (tds) => tds.map((td) => td.textContent));
  assert.equal(cells.length, 3);
  // Removing the first window takes about that much off the total.
  const num = (x) => Number(/\$([\d,.]+)/.exec(x)[1].replace(/,/g, ''));
  const before = num(await page.textContent('#summary-lines'));
  await page.click('#openings button[data-remove="1"]');
  await page.waitForFunction((b) => !document.querySelector('#summary-lines').textContent.includes(b), String(before));
  const after = num(await page.textContent('#summary-lines'));
  assert.ok(Math.abs(before - after - num(cells[1])) < 0.02, `removing it saved ${before - after}, the column said ${cells[1]}`);
});

test('lists, 3D view and build steps point at each other', { skip }, async (t) => {
  const { page } = await open(t);
  const canvas = page.locator('#view3d');
  await page.click('#jump [data-jump="panel-shopping"]');
  const plain = await canvas.screenshot();
  // A lumber line: its pieces light up in 3D and the box says what they are.
  await page.click('#shopping button[data-xref-lumber^="PT 4x4"]');
  await page.waitForSelector('#xref:not([hidden])');
  assert.match(await page.textContent('#xref'), /skid \(A\): \d+ x/);
  await settle(page);
  assert.ok(!(await canvas.screenshot()).equals(plain), 'the skids are highlighted');
  // The box links to the build step that uses them.
  await page.click('#xref button[data-xstep]');
  await page.waitForFunction(() => !document.querySelector('#panel-build').hidden && document.querySelector('#build-steps > li.xref-on'));
  assert.match(await page.textContent('#build-steps > li.xref-on h3'), /Skids/);
  // A part's row, and the cut sheet marks the boards it comes from.
  await page.click('#jump [data-jump="panel-parts"]');
  await page.click('#parts tr[data-mark="F"] button.xref-btn');
  await page.waitForFunction(() => /rafter \(F\)/.test(document.querySelector('#xref').textContent));
  assert.ok(await page.$('#cuts li.xref-on'), 'the cut sheet marks the rafter boards');
  assert.ok(await page.$('#plans text.mark.xref-on'), 'the plans mark the rafters');
  await page.click('#xref button[data-xgo="panel-plans"]');
  await page.waitForFunction(() => !document.querySelector('#panel-plans').hidden);
  assert.match(await page.textContent('#xref'), /Plans: .*Roof framing plan/);
  // Clicking a board in the 3D view names it.
  await page.click('#xref button[data-xclear]');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  let named = '';
  for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.6], [0.55, 0.4], [0.5, 0.75], [0.4, 0.45]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    named = await page.$eval('#xref', (e) => (e.hidden ? '' : e.textContent));
    if (named) break;
  }
  // The outside of the shed is siding and shingles now, not the stud behind them.
  assert.match(named, /mark [A-Z]+|Bought as: /, 'a click on the model names a board or a panel');
});

test('sheet goods, siding, roofing, trim and door hardware lines show in 3D too', { skip }, async (t) => {
  const { page } = await open(t);
  const canvas = page.locator('#view3d');
  await page.click('#jump [data-jump="panel-shopping"]');
  const plain = await canvas.screenshot();
  const buttons = page.locator('#shopping button[data-xref-line]');
  assert.ok(await buttons.count() >= 8, 'most non-lumber lines can be shown');
  // The roof sheathing line: the sheets light up, and its row is marked.
  const sheathing = page.locator('#shopping tr', { hasText: 'roof sheathing' }).locator('button[data-xref-line]');
  await sheathing.click();
  await page.waitForFunction(() => /Roof sheathing/.test(document.querySelector('#xref').textContent));
  assert.match(await page.textContent('#xref'), /Bought as: .*roof sheathing/i);
  await settle(page);
  assert.ok(!(await canvas.screenshot()).equals(plain), 'the sheets are highlighted');
  assert.ok(await page.$('#shopping tr.xref-on'), 'the shopping line is marked');
  // A hinge points at its door, and the door's frame parts are in the parts list.
  await page.locator('#shopping tr', { hasText: 'tee hinge' }).locator('button[data-xref-line]').click();
  await page.waitForFunction(() => /door stile \([A-Z]+\)/.test(document.querySelector('#xref').textContent));
  assert.ok(await page.$('#parts tr.xref-on'), 'the door parts are marked in the parts list');
});

test('on a phone: no sideways scroll, finger-size handles, touch drag and pinch', { skip }, async (t) => {
  const { ctx, page } = await open(t, pw.devices['Pixel 7']);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(sw, 0, 'no horizontal page scroll');
  const small = await page.$$eval('.handle-hit', (hs) => hs.map((h) => Math.round(h.getBoundingClientRect().width)).filter((w) => w < 44));
  assert.deepEqual(small, [], 'every handle is at least 44 px across');

  const cdp = await ctx.newCDPSession(page);
  const touchDrag = async (x, y, dx, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const hit = page.locator('#plan [data-key="plan-len"]');
  await hit.scrollIntoViewIfNeeded();
  const [x, y] = await center(hit);
  // Grab it at the edge of the finger target, not dead centre.
  await touchDrag(x - 14, y + 10, 40, 0);
  assert.ok(Number(await val(page, 'lengthFt')) > 12, 'touch drag resized');

  const canvas = page.locator('#view3d');
  await canvas.scrollIntoViewIfNeeded();
  const [cx, cy] = await center(canvas);
  const before = await canvas.screenshot();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 20, y: cy, id: 1 }, { x: cx + 20, y: cy, id: 2 }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 20 - i * 12, y: cy, id: 1 }, { x: cx + 20 + i * 12, y: cy, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page);
  assert.notDeepEqual(await canvas.screenshot(), before, 'pinch changed the view');
});

test('the 3D view takes the keyboard', { skip }, async (t) => {
  const { page } = await open(t);
  const canvas = page.locator('#view3d');
  await canvas.focus();
  const before = await canvas.screenshot();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('+');
  await settle(page);
  assert.notDeepEqual(await canvas.screenshot(), before);
});

test('the 3D view pans with Shift and the arrows, a right-drag and two fingers, and stays near the shed', { skip }, async (t) => {
  const { ctx, page } = await open(t);
  const canvas = page.locator('#view3d');
  await canvas.scrollIntoViewIfNeeded();
  await page.click('#view-reset');
  await canvas.focus();
  await settle(page);
  const start = await canvas.screenshot();
  await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  const moved = await canvas.screenshot();
  assert.ok(!(moved).equals(start), 'Shift+arrow slides the view');
  // However far you push, the view stops near the shed.
  for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  const far = await canvas.screenshot();
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  assert.ok((await canvas.screenshot()).equals(far), 'the pan is clamped');
  await page.click('#view-reset');
  await canvas.focus();
  await settle(page);
  assert.ok((await canvas.screenshot()).equals(start), 'Reset clears the pan');
  const [x, y] = await center(canvas);
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' }); await page.mouse.move(x + 60, y + 20, { steps: 4 }); await page.mouse.up({ button: 'right' });
  await settle(page);
  const right = await canvas.screenshot();
  assert.ok(!(right).equals(start), 'a right-drag slides the view');
  await page.click('#view-reset'); await settle(page);
  // Two fingers moving together (no spread change) pan.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 30 + i * 10, y, id: 1 }, { x: x + 30 + i * 10, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page);
  assert.ok(!(await canvas.screenshot()).equals(start), 'two fingers slide the view');
});

test('orbiting the 3D view measures each dimension label once, not every frame', { skip }, async (t) => {
  const { page } = await open(t);
  await page.evaluate(() => {
    const w = /** @type {any} */ (window); w.reads = 0;
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { if (this.parentElement?.classList.contains('dim-overlay')) w.reads++; return d.get.call(this); } });
  });
  const canvas = page.locator('#view3d');
  await canvas.focus();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('ArrowLeft'); await settle(page); }
  const [reads, labels] = await page.evaluate(() => [/** @type {any} */ (window).reads, document.querySelectorAll('.dim-overlay span').length]);
  assert.ok(labels > 0, 'there are labels');
  assert.ok(reads <= labels, `${reads} width reads for ${labels} labels over 8 frames`);
});

test('the store table, other tabs and design cards catch up just after an edit', { skip }, async (t) => {
  const { page } = await open(t);
  await page.fill('#lengthFt', '16');
  await page.press('#lengthFt', 'Tab');
  await page.waitForFunction(() => document.querySelector('#compare-cards')?.textContent.includes('16\' 0" x 8\' 0"'), null, { timeout: 5000 });
  assert.ok((await page.$eval('#stores', (e) => e.textContent)).length > 50, 'store comparison drawn');
  await page.click('[data-panel="panel-cuts"]');
  assert.ok(await page.isVisible('#panel-cuts'));
});

test('choosing site-built trusses re-frames the roof: truss checks, truss sheet, truss build steps', { skip }, async (t) => {
  const { page } = await open(t);
  const before = await page.textContent('#total');
  await page.selectOption('#roofType', 'truss');
  await page.waitForFunction((b) => document.querySelector('#total')?.textContent !== b, before, { timeout: 5000 });
  await page.click('[data-panel="panel-structure"]');
  await page.waitForFunction(() => document.querySelector('#panel-structure')?.textContent.includes('Truss bottom chords'), null, { timeout: 5000 });
  assert.doesNotMatch(await page.textContent('#panel-structure'), /Ridge beam/);
  await page.click('[data-panel="panel-plans"]');
  await page.waitForFunction(() => document.querySelector('#panel-plans')?.textContent.includes('Truss detail'), null, { timeout: 5000 });
  await page.click('[data-panel="panel-build"]');
  await page.waitForFunction(() => document.querySelector('#panel-build')?.textContent.includes('Build the trusses'), null, { timeout: 5000 });
});

test('a share link opens as a new design, and a broken one says so', { skip }, async (t) => {
  const { page } = await open(t);
  const d = await page.evaluate(() => ({ name: 'Link test', length: 120, width: 96 }));
  const b64 = Buffer.from(JSON.stringify(d)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await page.goto(`${base}#d=${b64}`); await page.reload();
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  assert.equal(await val(page, 'lengthFt'), '10');
  assert.match(await page.$eval('#status', (e) => e.textContent), /Opened the shared design "Link test"/);
  assert.equal(await page.evaluate(() => location.hash), '', 'the link is taken out of the address bar');
  await page.goto(`${base}#d=${b64.slice(0, 11)}`); await page.reload();
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  assert.match(await page.$eval('#status', (e) => e.textContent), /broken or cut short/);
});

test('axe finds no accessibility violations on any results tab', { skip: skip || (AXE ? false : 'axe-core not found (set AXE to axe.min.js)') }, async (t) => {
  const { page } = await open(t);
  await page.addScriptTag({ content: readFileSync(/** @type {string} */ (AXE), 'utf8') });
  const tabs = await page.$$eval('.result-tabs [data-panel]', (bs) => bs.map((b) => b.dataset.panel));
  for (const tab of tabs) {
    await page.click(`[data-panel="${tab}"]`);
    await settle(page);
    const v = await page.evaluate(async () => (await /** @type {any} */ (window).axe.run(document, { resultTypes: ['violations'] })).violations
      .map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    assert.deepEqual(v, [], `violations with the ${tab} tab open`);
  }
});

test('grabbing a door near its end does not jump it, and a phone-size target lets you drag it', { skip }, async (t) => {
  const { ctx, page } = await open(t, pw.devices['Pixel 7']);
  const small = await page.$$eval('.opening-hit', (hs) => hs.map((h) => h.getBoundingClientRect()).filter((r) => r.width < 43 || r.height < 43).length);
  assert.equal(small, 0, 'every door and window target is at least 44 px each way');
  const offset = () => page.$eval('#openings input[data-k="offset"]', (e) => Number(e.value));
  const before = await offset();
  const shape = page.locator('#plan .opening.door');
  await shape.scrollIntoViewIfNeeded();
  const b = await shape.boundingBox();
  // Press near the left end, a little off the wall line, and lift without moving far.
  const cdp = await ctx.newCDPSession(page);
  const x = b.x + 3; const y = b.y + b.height / 2 + 8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 1, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const nudged = await offset();
  assert.ok(Math.abs(nudged - before) <= 2, `a 1 px move moved the door ${nudged - before}"`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 6, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await offset() > nudged + 10, 'dragging right moved it right');
});

test('on a phone the end view fills its box and every label is inside it', { skip }, async (t) => {
  const { page } = await open(t, pw.devices['Pixel 7']);
  for (const preset of [null, '12x16', 'lean-to']) {
    if (preset) {
      const opt = await page.$$eval('#new-design option', (os, p) => os.find((o) => o.textContent.includes(p))?.value, preset);
      if (!opt) continue;
      await page.selectOption('#new-design', opt);
      await settle(page);
    }
    const r = await page.evaluate(() => {
      const box = document.querySelector('#endview').getBoundingClientRect();
      const wall = document.querySelector('#endview .endwall').getBoundingClientRect();
      const out = [...document.querySelectorAll('#endview text')].map((x) => x.getBoundingClientRect())
        .filter((b) => b.left < box.left - 1 || b.right > box.right + 1 || b.top < box.top - 1 || b.bottom > box.bottom + 1).length;
      return { share: wall.width / box.width, out };
    });
    assert.ok(r.share > 0.35, `the gable end is ${(r.share * 100).toFixed(0)}% of the box width (${preset || 'default'})`);
    assert.equal(r.out, 0, `labels outside the end view (${preset || 'default'})`);
  }
});

test('the ready-design gallery: every card with price, storage and reason with price, storage and reason; arrows and keys flick through; Start opens a new design', { skip }, async (t) => {
  const { page } = await open(t);
  const N = (await import('./gallery-data.mjs')).GALLERY_DESIGNS.length;
  const cards = page.locator('#starts .pick');
  assert.equal(await cards.count(), N);
  for (const text of await cards.allInnerTexts()) {
    assert.match(text, /\$\d[\d,]*/);
    assert.match(text, /\d+ cu ft inside/);
    assert.match(text, /ft of clear wall/);
  }
  assert.match(await cards.first().innerText(), /lowest price of the \d+ designs/i);
  await page.waitForFunction((n) => document.querySelectorAll('#starts .pick-img img').length === n, N, { timeout: 60000 });
  const pos = () => page.textContent('#starts-pos');
  assert.equal(await pos(), `1 of ${N}`);
  assert.ok(await page.isDisabled('#starts-prev'));
  await page.click('#starts-next');
  await page.waitForFunction((n) => document.querySelector('#starts-pos')?.textContent === `2 of ${n}`, N);
  await page.focus('#starts .pick-list');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((n) => document.querySelector('#starts-pos')?.textContent === `3 of ${n}`, N);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((n) => document.querySelector('#starts-pos')?.textContent === `2 of ${n}`, N);
  // On a wide screen the last cards share the view: the arrow still steps to each one.
  for (let i = 0; i < N - 2; i++) await page.click('#starts-next');
  await page.waitForFunction((n) => document.querySelector('#starts-pos')?.textContent === `${n} of ${n}`, N);
  assert.ok(await page.isDisabled('#starts-next'));
  for (let i = 0; i < N - 1; i++) await page.click('#starts-prev');
  await page.waitForFunction((n) => document.querySelector('#starts-pos')?.textContent === `1 of ${n}`, N);
  // Start from the first card: it opens as a new design tab, priced as its card said.
  const cardPrice = /\$[\d,]+/.exec(await cards.first().innerText())?.[0];
  const tabs = await page.locator('#design-tabs [role=tab]').count();
  await cards.first().locator('.pick-open').click();
  await page.locator('#pick-dialog [data-start]').click();
  await page.waitForFunction((n) => document.querySelectorAll('#design-tabs [role=tab]').length === n + 1, tabs);
  assert.equal(await page.getAttribute('#design-tabs [role=tab]:last-child', 'aria-selected'), 'true');
  assert.match(await page.textContent('#design-tabs [role=tab]:last-child'), /^Cheapest /);
  assert.ok(cardPrice, 'the card shows a price');
});

test('each card says its siding and roof; "match a house" limits the strip to lap and shingles and is remembered', { skip }, async (t) => {
  const { page } = await open(t);
  const N = (await import('./gallery-data.mjs')).GALLERY_DESIGNS.length;
  const finishes = await page.locator('#starts .pick-finish').allInnerTexts();
  assert.equal(finishes.length, N);
  assert.ok(finishes.every((x) => /^Siding: .+ · (metal|asphalt shingle) roof$/.test(x)), JSON.stringify(finishes));
  // Some free-finish card is not lap with shingles, so "match a house" has something to filter.
  assert.ok(finishes.some((x) => !/lap .*asphalt shingle roof$/.test(x)), 'the free-finish cards include one that is not lap and shingles');
  await page.check('#match-house');
  await page.waitForFunction((n) => document.querySelectorAll('#starts .pick').length < n, N);
  const house = await page.locator('#starts .pick-finish').allInnerTexts();
  assert.ok(house.length >= 4, `${house.length} cards`);
  assert.ok(house.every((x) => /lap .*asphalt shingle roof$/.test(x)), JSON.stringify(house));
  assert.equal(await page.textContent('#starts-pos'), `1 of ${house.length}`);
  // Remembered on the next visit, and switching it off brings all ten back.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  assert.ok(await page.isChecked('#match-house'));
  await page.waitForFunction((n) => document.querySelectorAll('#starts .pick').length === n, house.length);
  await page.uncheck('#match-house');
  await page.waitForFunction((n) => document.querySelectorAll('#starts .pick').length === n, N);
});

test('on a phone the gallery shows about one card at a time and swipes sideways', { skip }, async (t) => {
  const { page } = await open(t, pw.devices['Pixel 7']);
  const N = (await import('./gallery-data.mjs')).GALLERY_DESIGNS.length;
  const r = await page.evaluate(() => {
    const track = /** @type {HTMLElement} */ (document.querySelector('#starts .pick-list'));
    const card = /** @type {HTMLElement} */ (track.querySelector('.pick'));
    return { track: track.clientWidth, card: card.getBoundingClientRect().width, scrolls: track.scrollWidth > track.clientWidth, page: document.documentElement.scrollWidth, vw: window.innerWidth };
  });
  assert.ok(r.card > r.track * 0.5 && r.card <= r.track, `card ${r.card}px in a ${r.track}px strip`);
  assert.ok(r.scrolls, 'the strip scrolls sideways');
  assert.ok(r.page <= r.vw + 1, `the page itself does not scroll sideways (${r.page} > ${r.vw})`);
  await page.click('#starts-next');
  await page.waitForFunction((n) => document.querySelector('#starts-pos')?.textContent === `2 of ${n}`, N);
});

test('where the money goes: bars by assembly open their lines, an edit says what it moved, the bridge runs', { skip }, async (t) => {
  const { page } = await open(t);
  await page.click('[data-panel="panel-costs"]');
  await settle(page);
  const rows = page.locator('#cost-chart button.cost-row');
  assert.ok(await rows.count() >= 9, 'one bar per assembly');
  const first = rows.first();
  assert.equal(await first.getAttribute('aria-expanded'), 'false');
  await first.click();
  assert.equal(await first.getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('#cost-chart .cost-lines:not([hidden]) tbody tr').count() >= 1, 'its lines show');
  await page.click('[data-cost-by="materials"]');
  assert.match(await page.textContent('#cost-chart'), /Treated lumber/);
  // An edit: OSB under the floor instead of plywood.
  await page.selectOption('#floorPanel', 'OSB');
  await settle(page);
  assert.match(await page.textContent('#cost-delta'), /^Last change: materials −\$\d+ \(floor −\$\d+/);
  // Leaving a line out takes it off the breakdown too, as it does the headline.
  const before = await page.textContent('#cost-chart .cost-foot');
  await page.click('[data-panel="panel-shopping"]');
  await page.locator('#shopping input[data-skip]').first().check();
  await page.click('[data-panel="panel-costs"]');
  await settle(page);
  assert.notEqual(await page.textContent('#cost-chart .cost-foot'), before);
  assert.match(await page.textContent('#cost-chart .cost-foot'), /less the 1 line you have or left out/);
  await page.click('#cost-bridge-run');
  await page.waitForSelector('#cost-bridge ol.bridge, #cost-bridge p:not(.muted)', { timeout: 60000 });
  const steps = await page.locator('#cost-bridge ol.bridge li').count();
  if (steps) assert.match(await page.textContent('#cost-bridge'), /Cheapest passing design/);
});

test('on a phone the cost bars fit the width', { skip }, async (t) => {
  const { page } = await open(t, { ...pw.devices['Pixel 7'] });
  await page.click('[data-panel="panel-costs"]');
  await settle(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `no sideways scroll (${over}px)`);
  const r = await page.evaluate(() => [...document.querySelectorAll('#cost-chart .cost-row')].map((b) => {
    const row = b.getBoundingClientRect(); const amt = /** @type {HTMLElement} */ (b.querySelector('.cost-amt')).getBoundingClientRect();
    return { right: amt.right - row.right, h: row.height };
  }));
  assert.ok(r.every((x) => x.right <= 1), 'every amount inside its row');
  assert.ok(r.every((x) => x.h >= 44), 'finger-size rows');
});

test('presentation mode: sky, no outlines or dimensions, and a picked colour reaches the design', { skip }, async (t) => {
  const { page } = await open(t);
  /** The canvas colour at a fraction of its width and height, 0 to 255. */
  const pixel = (fx, fy) => page.$eval('#view3d', (c, [x, y]) => {
    const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
    const k = /** @type {CanvasRenderingContext2D} */ (g.getContext('2d')); k.drawImage(c, 0, 0);
    return [...k.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data.slice(0, 3)];
  }, [fx, fy]);
  await page.click('#presentation');
  await settle(page);
  assert.equal(await page.getAttribute('#presentation', 'aria-pressed'), 'true');
  assert.equal(await page.isChecked('#show-outlines'), false);
  assert.equal(await page.isChecked('#show-dims'), false);
  const [r, g, b] = await pixel(0.02, 0.03);
  assert.ok(b > r + 40 && b > 150, `the top corner is sky blue (${r},${g},${b})`);
  const [gr, gg, gb] = await pixel(0.02, 0.97);
  assert.ok(gg > gr && gg > gb, `the bottom corner is lawn (${gr},${gg},${gb})`);
  // A hex from the picker becomes the siding colour, and one undo step takes it back.
  await page.$eval('#sidingColor-custom', (e) => { e.value = '#5a6e8c'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await val(page, 'sidingColor'), '#5a6e8c');
  await page.selectOption('#doorColor', 'match trim');
  assert.equal(await val(page, 'doorColor'), 'match trim');
  await page.click('#undo');
  await page.click('#undo');
  assert.equal(await val(page, 'sidingColor'), 'natural');
  await page.click('#presentation');
  assert.equal(await page.isChecked('#show-outlines'), true, 'leaving presentation brings the outlines back');
});

test('the part options table prices each choice, and "Use this" changes the design with one undo', { skip }, async (t) => {
  const { page } = await open(t);
  const before = await page.$eval('#total', (e) => e.textContent);
  await page.click('#levers');
  await page.waitForSelector('#levers-out table.levers');
  const titles = await page.$$eval('#levers-out h4', (hs) => hs.map((h) => h.textContent));
  for (const g of ['Foundation', 'Floor', 'Windows']) assert.ok(titles.includes(g), g);
  assert.ok(titles.some((x) => /^Door /.test(x)));
  const noWin = page.locator('#levers-out tr', { hasText: 'No windows' }).locator('button[data-lever]');
  await noWin.click();
  await settle(page);
  assert.notEqual(await page.$eval('#total', (e) => e.textContent), before, 'the total moved');
  await page.click('#undo');
  await settle(page);
  assert.equal(await page.$eval('#total', (e) => e.textContent), before, 'undo restores it');
});

test('ticking a fixed choice keeps it out of the part options, and undo unticks it', { skip }, async (t) => {
  const { page } = await open(t);
  await page.check('input[name="lock"][value="windows"]');
  await settle(page);
  await page.click('#levers');
  await page.waitForSelector('#levers-out table.levers');
  assert.match(await page.locator('#levers-out h4', { hasText: 'Windows' }).textContent(), /kept as you chose/);
  assert.equal(await page.locator('#levers-out tr', { hasText: 'No windows' }).count(), 0);
  await page.click('#undo');
  await settle(page);
  assert.equal(await page.isChecked('input[name="lock"][value="windows"]'), false, 'undo unticks it');
});

test('the lean-to preset draws one slope in the editor, and the shape box switches it back to a gable', { skip }, async (t) => {
  const { page } = await open(t);
  const opt = await page.$$eval('#new-design option', (os) => os.find((o) => o.textContent.includes('lean-to'))?.value);
  assert.ok(opt, 'a lean-to in the New design menu');
  await page.selectOption('#new-design', opt);
  await settle(page);
  assert.equal(await val(page, 'style'), 'leanTo');
  const labels = await page.$$eval('#endview text', (xs) => xs.map((x) => x.textContent).join(' | '));
  assert.match(labels, /back wall/);
  assert.match(labels, /end wall/);
  assert.doesNotMatch(await page.$eval('#plan', (e) => e.textContent), /ridge/);
  // The pitch handle sits on the tall front wall; an arrow key steepens the roof.
  const pitch0 = Number(await val(page, 'pitch'));
  await page.focus('[data-key="end-peak"]');
  await page.keyboard.press('ArrowUp');
  await settle(page);
  assert.equal(Number(await val(page, 'pitch')), pitch0 + 1);
  const total = await page.$eval('#total', (e) => e.textContent);
  await page.selectOption('#style', 'gable');
  await settle(page);
  assert.match(await page.$eval('#plan', (e) => e.textContent), /ridge/);
  assert.notEqual(await page.$eval('#total', (e) => e.textContent), total, 'the gable is priced again');
});

test('the saltbox preset: an off-centre peak in the editor, the front-pitch field, both pitches on the handle', { skip }, async (t) => {
  const { page } = await open(t);
  const opt = await page.$$eval('#new-design option', (os) => os.find((o) => o.textContent.includes('saltbox'))?.value);
  assert.ok(opt, 'a saltbox in the New design menu');
  await page.selectOption('#new-design', opt);
  await settle(page);
  assert.equal(await val(page, 'style'), 'saltbox');
  assert.ok(await page.isVisible('#frontPitch'), 'the front-pitch field shows on a saltbox');
  assert.match(await page.$eval('#endview', (e) => e.textContent), /10\/12 and 5\/12/);
  assert.match(await page.$eval('#plan', (e) => e.textContent), /ridge \(off centre\)/);
  // The peak handle sits left of mid-width (the steep front is on the left); an arrow key steepens both slopes.
  const box = await page.$eval('#endview', (svg) => { const g = svg.querySelector('[data-key="end-peak"]'); const r = g.getBoundingClientRect(); const s = svg.querySelector('.endwall').getBoundingClientRect(); return { x: r.x + r.width / 2 - s.x, w: s.width }; });
  assert.ok(box.x < box.w * 0.45, `peak at ${box.x} of ${box.w}`);
  await page.focus('[data-key="end-peak"]');
  await page.keyboard.press('ArrowUp');
  await settle(page);
  assert.equal(Number(await val(page, 'pitch')), 6);
  assert.equal(Number(await val(page, 'frontPitch')), 12);
  await page.selectOption('#style', 'gable');
  await settle(page);
  assert.ok(!(await page.isVisible('#frontPitch')), 'and hides on a gable');
});

test('Save picture downloads the 3D view as a PNG', { skip }, async (t) => {
  const { page } = await open(t);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save-picture')]);
  assert.match(dl.suggestedFilename(), /-3d\.png$/);
  const path = await dl.path();
  const head = readFileSync(/** @type {string} */ (path)).subarray(0, 8);
  assert.deepEqual([...head], [137, 80, 78, 71, 13, 10, 26, 10], 'a PNG file');
});

test('a first-time visitor opens on a gallery design (the balanced one, unless it costs more than the 8x12) with nothing to check', { skip }, async (t) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  t.after(() => ctx.close());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  const first = (await import('./gallery-ui.mjs')).firstDesign();
  assert.equal(await page.$eval('#name', (e) => e.value), first.name);
  assert.equal(await page.$eval('#lengthFt', (e) => Number(e.value)), first.length / 12);
  assert.equal((await page.locator('#warnings').innerText()).trim(), '', 'no "Check these" list');
  assert.deepEqual(errors, []);
});

test('a typed budget shows how far the cheaper build gets, what else would close the gap, and a smaller shed that fits', { skip }, async (t) => {
  const { page } = await open(t);
  await page.fill('#budget-target', '2000');
  await page.click('#budget');
  const out = page.locator('#budget-out .budget-path');
  await out.waitFor({ timeout: 60000 });
  const text = await out.innerText();
  assert.match(text, /Your budget: \$2,000/);
  assert.match(text, /No spare boards: saves \$\d+/);
  assert.match(text, /What fits \$2,000 in this design|Smaller does not get there either/);
  if (await out.locator('[data-budget-use="smaller"]').count()) {
    const before = await page.locator('#design-list option, #designs option').count();
    await out.locator('[data-budget-use="smaller"]').click();
    assert.match(await page.$eval('#name', (e) => e.value), /smaller, to fit the budget/);
    assert.ok((await page.locator('#design-list option, #designs option').count()) >= before);
  }
  // Remembered for the next visit, in this browser only.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  assert.equal(await page.$eval('#budget-target', (e) => e.value), '2000');
});

test('the sticky section bar fades and lets a click through when a plan handle is under it', { skip }, async (t) => {
  const { page } = await open(t);
  const handle = page.locator('.handle-hit').first();
  await handle.scrollIntoViewIfNeeded();
  const bar = await page.locator('#jump').boundingBox();
  const hb = await handle.boundingBox();
  // Scroll so the handle sits in the middle of the bar.
  await page.evaluate((dy) => scrollBy(0, dy), hb.y + hb.height / 2 - (bar.y + bar.height / 2));
  await page.waitForFunction(() => document.querySelector('#jump').classList.contains('over-handle'));
  const h2 = await handle.boundingBox();
  const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('class'), [h2.x + h2.width / 2, h2.y + h2.height / 2]);
  assert.match(under || '', /^handle(-hit)?$/, 'the pointer reaches the handle, not the bar');
  // Scroll the handle clear and the bar comes back.
  await page.evaluate(() => scrollBy(0, -300));
  await page.waitForFunction(() => !document.querySelector('#jump').classList.contains('over-handle'));
});

test('first-time pass: the HOA packet is one click from the section bar, and on a phone every shopping line can be left out without a sideways scroll', { skip }, async (t) => {
  const { page } = await open(t);
  // The bar says what its total adds over the before-tax prices on the gallery cards.
  const taxed = /\+ \$[\d,.]+ tax/.test(await page.textContent('#summary-lines'));
  assert.match(await page.textContent('#total-pill-l'), taxed ? /^Total incl\. tax/ : /^Total/);
  const [pop] = await Promise.all([page.context().waitForEvent('page'), page.click('#jump #jump-hoa')]);
  await pop.waitForLoadState();
  assert.match(pop.url(), /hoa-packet\.html#d=/);
  await pop.close();
  const { page: phone } = await open(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // The gallery's long explanation is folded away, so the first card is near the top.
  assert.equal(await phone.locator('.hint-more').getAttribute('open'), null, 'how the designs were picked starts folded');
  await phone.click('#jump [data-jump="panel-shopping"]');
  const box = phone.locator('#shopping tr[data-line] input[data-skip]').first();
  await box.scrollIntoViewIfNeeded();
  const b = await box.boundingBox();
  assert.ok(b && b.x >= 0 && b.x + b.width <= 390, `the Leave out box is on screen: ${JSON.stringify(b)}`);
  const before = await phone.textContent('#total-pill-n');
  await box.tap();
  await phone.waitForFunction((x) => document.querySelector('#total-pill-n').textContent !== x, before);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
});

test('a shopping line can be swapped for your own product, kept on reload and put back', { skip }, async (t) => {
  const { page } = await open(t);
  await page.click('[data-panel="panel-shopping"]');
  const before = await page.$eval('#total', (e) => e.textContent);
  const row = page.locator('#shopping tr[data-line]', { hasText: 'T1-11' }).first();
  const orig = (await row.locator('td').first().textContent()) || '';
  await row.locator('[data-swap-line]').click();
  const form = page.locator('#shopping [data-swap-form]');
  await form.locator('[data-swap-field="name"]').fill('Primed wood lap siding, 8 in x 16 ft');
  await form.locator('[data-swap-field="price"]').fill('31.50');
  await form.locator('[data-swap-field="qty"]').fill('40');
  await form.locator('[data-swap-field="url"]').fill('https://www.homedepot.com/p/example/1');
  await form.locator('button[type="submit"]').click();
  await settle(page);
  const swapped = page.locator('#shopping tr.swapped').first();
  assert.match(await swapped.textContent(), /Primed wood lap siding.*instead of T1-11/s);
  assert.match(await swapped.textContent(), /\$1,260\.00/);
  assert.equal(await swapped.locator('a[href="https://www.homedepot.com/p/example/1"]').count(), 1);
  assert.notEqual(await page.$eval('#total', (e) => e.textContent), before);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  await page.click('[data-panel="panel-shopping"]');
  assert.equal(await page.locator('#shopping tr.swapped').count(), 1, 'the swap is remembered');
  await page.locator('#shopping tr.swapped [data-swap-line]').click();
  await page.locator('#shopping [data-swap-remove]').click();
  await settle(page);
  assert.equal(await page.locator('#shopping tr.swapped').count(), 0);
  assert.equal(await page.$eval('#total', (e) => e.textContent), before);
  assert.ok(orig.includes('T1-11'));
});
