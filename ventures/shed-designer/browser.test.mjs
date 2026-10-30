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
async function open(t, ctxOpts = { viewport: { width: 1366, height: 900 } }) {
  const ctx = await browser.newContext(ctxOpts);
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
  assert.match(await page.textContent('#shopping'), /PT 4x4 x \d+'for skid/, 'lumber lines say what they are for');
  assert.match(await page.textContent('#cuts'), /\d+ ft → .*\(\w+\)/, 'cut sheet boards say what they are cut into');
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
  for (const preset of [null, '12x16']) {
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
