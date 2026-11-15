// Browser check for picture pairs on a phone and the "Look closer" view
// (docs/RANK-PAGE.md, "Pictures on a phone"). Not part of the test gate: it
// needs Chromium and a static server over site/, e.g.
//   (cd site && python3 -m http.server 8765) &
//   node scripts/picture-compare-browser-check.mjs [base-url] [screenshot-dir]
// Prints the drawn picture sizes per layout and the close-up's behaviour.
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
// Playwright is resolved like a CommonJS require, so a globally installed copy is found too.
const load = createRequire(import.meta.url);
const BASE = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || os.tmpdir();
const { chromium } = load('playwright');
(async () => {
  const b = await chromium.launch();
  const mk = await b.newPage();
  async function png(w, h, hue, label) {
    const url = await mk.evaluate(([w, h, hue, label]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = `hsl(${hue},60%,50%)`; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; for (let k = 0; k < w; k += 40) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, h); x.stroke(); } x.fillStyle = '#000'; x.font = '80px sans-serif'; x.fillText(label, w / 3, h / 2); return c.toDataURL('image/png'); }, [w, h, hue, label]);
    return Buffer.from(url.split(',')[1], 'base64');
  }
  const land = []; for (let i = 0; i < 5; i++) land.push({ name: `shot-${i + 1}.png`, mimeType: 'image/png', buffer: await png(1500, 1000, i * 70, `shot ${i + 1}`) });
  const tall = []; for (let i = 0; i < 4; i++) tall.push({ name: `screen-${i + 1}.png`, mimeType: 'image/png', buffer: await png(900, 1600, i * 70, `s${i + 1}`) });
  const errors = [];
  async function run(files, viewport, tag) {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    await p.goto(BASE + 'rank.html');
    await p.setInputFiles('#images', files);
    await p.click('#start');
    if (await p.isVisible('#pile-skip')) await p.click('#pile-skip');
    await p.waitForSelector('#pair img');
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const r = [...document.querySelectorAll('#pair img')].map((im) => { const b = im.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
      return { stack: document.querySelector('#pair').classList.contains('stack'), imgs: r, scrollW: document.documentElement.scrollWidth, closerBtn: !document.querySelector('#closer-open').classList.contains('hidden'), pairView: (() => { const r = document.querySelector('#pair').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; })() };
    });
    console.log(tag, JSON.stringify(m));
    await p.screenshot({ path: path.join(OUT, `${tag}.png`) });
    return { p, ctx };
  }
  // Old layout numbers: force side by side by removing the stack class.
  const { p, ctx } = await run(land, { width: 390, height: 844 }, 'phone-landscape');
  const side = await p.evaluate(() => { document.querySelector('#pair').classList.remove('stack'); return [...document.querySelectorAll('#pair img')].map((im) => { const b = im.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }); });
  console.log('phone-landscape forced side by side', JSON.stringify(side));
  // Close-up: open, flip, zoom, choose; stays open on the next pair.
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('quick-pick-rank:'))) || '{"answers":[]}').answers.length);
  await p.click('#closer-open');
  const c1 = await p.evaluate(() => ({ which: document.querySelector('#closer-which').textContent, box: (() => { const b = document.querySelector('#closer-img').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })() }));
  await p.keyboard.press(' ');
  const c2 = await p.evaluate(() => document.querySelector('#closer-which').textContent);
  const ib = await p.evaluate(() => { const b = document.querySelector('#closer-img').getBoundingClientRect(); return { x: b.left + b.width * 0.8, y: b.top + b.height * 0.2 }; });
  await p.mouse.click(ib.x, ib.y);
  const z1 = await p.evaluate(() => document.querySelector('#closer-img').style.transformOrigin);
  await p.click('#closer-flip');
  const z2 = await p.evaluate(() => [document.querySelector('#closer-img').style.transformOrigin, document.querySelector('#closer-which').textContent]);
  await p.screenshot({ path: path.join(OUT, 'closer-zoomed.png') });
  await p.click('#closer-pick');
  const after = await p.evaluate(() => ({ open: !document.querySelector('#closer').classList.contains('hidden'), which: document.querySelector('#closer-which').textContent, zoom: document.querySelector('#closer-img').style.transform, n: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('quick-pick-rank:')))).answers }));
  console.log('closer', JSON.stringify({ before, c1, c2, z1, z2, after }));
  await p.keyboard.press('Enter'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Escape');
  const esc = await p.evaluate(() => ({ open: !document.querySelector('#closer').classList.contains('hidden'), n: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('quick-pick-rank:')))).answers.length }));
  console.log('after enter, down, esc', JSON.stringify(esc));
  // Keep picking in the close-up to the end: it must close when results show.
  await p.keyboard.press('f');
  for (let k = 0; k < 80 && await p.isVisible('#closer'); k++) await p.keyboard.press('Enter');
  console.log('end', JSON.stringify(await p.evaluate(() => ({ closer: !document.querySelector('#closer').classList.contains('hidden'), results: !document.querySelector('#results').classList.contains('hidden') }))));
  await ctx.close();
  await (await run(land, { width: 1280, height: 900 }, 'desktop-landscape')).ctx.close();
  await (await run(tall, { width: 390, height: 844 }, 'phone-tall')).ctx.close();
  // A typed list: no close-up button.
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } }); const t = await ctx2.newPage();
  await t.goto(BASE + 'rank.html'); await t.fill('#list', 'a\nb\nc\nd'); await t.click('#start');
  console.log('typed list closer button visible:', await t.isVisible('#closer-open'));
  console.log('errors', JSON.stringify(errors));
  await b.close();
})();
