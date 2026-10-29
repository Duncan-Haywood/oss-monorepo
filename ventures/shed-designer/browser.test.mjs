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
