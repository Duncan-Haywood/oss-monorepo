// End-to-end check of the cull page's client proofing set (2026-11-25).
// Usage: (cd site && python3 -m http.server 8765 --bind 127.0.0.1) & node eval/cull-proofing-e2e.cjs WORKDIR
// Makes four synthetic JPEGs in Chromium, rates them, downloads the set, opens the gallery,
// hearts both proofs, pastes the list back and counts the labelled frames. Needs unzip and file.
const W = process.argv[2] || require('os').tmpdir() + '/proofing-e2e';
require('fs').mkdirSync(W + '/in', { recursive: true });
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
async function makeJpegs(b) {
  const p = await b.newPage();
  const out = await p.evaluate(async () => { const r = [];
    for (const [i, c] of ['#c33', '#3c3', '#33c', '#cc3'].entries()) {
      const cv = document.createElement('canvas'); cv.width = i === 1 ? 2000 : 3000; cv.height = i === 1 ? 3000 : 2000;
      const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, cv.width, cv.height); x.strokeStyle = '#fff'; x.lineWidth = 3;
      for (let k = 0; k < cv.width; k += 40) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 200, cv.height); x.stroke(); }
      const bl = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9)); const u8 = new Uint8Array(await bl.arrayBuffer());
      let s = ''; for (const v of u8) s += String.fromCharCode(v); r.push(btoa(s)); }
    return r; });
  out.forEach((d, i) => fs.writeFileSync(`${W}/in/IMG_${1001 + i}.JPG`, Buffer.from(d, 'base64')));
  await p.close();
}
(async () => {
  const b = await chromium.launch(); await makeJpegs(b); const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8765/cull.html');
  const dir = W + '/in';
  await p.setInputFiles('#pickFiles', fs.readdirSync(dir).map(f => path.join(dir, f)));
  await p.waitForSelector('.tile', { timeout: 20000 }); await p.waitForTimeout(1500);
  console.log('tiles', await p.locator('.tile').count());
  await p.locator('#grid').focus();
  // rate frames: 3,0,2,1 stars by name order? use sort name
  await p.selectOption('#sort', 'name');
  for (const k of ['3', 'ArrowRight', '1', 'ArrowRight', '2', 'ArrowRight', 'x']) await p.keyboard.press(k);
  await p.locator('#proofBox summary').click();
  await p.fill('#pfMark', '© Test Studio'); await p.fill('#pfTitle', 'Smith <wedding>'); await p.fill('#pfBy', 'Test & Co');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlProof')]);
  const zip = '' + W + '/set.zip'; await dl.saveAs(zip);
  console.log('zip name', dl.suggestedFilename(), 'state:', await p.textContent('#pfState'));
  execSync('rm -rf ' + W + '/out && mkdir -p ' + W + '/out && cd ' + W + '/out && unzip -q ../set.zip');
  console.log(execSync('cd ' + W + '/out && find . -type f | sort && file photos/*').toString());
  await p.screenshot({ path: W + '/cull.png', fullPage: false });
  const g = await ctx.newPage(); g.on('pageerror', e => errs.push('gallery: ' + e));
  await g.goto('file://' + W + '/out/index.html');
  await g.waitForTimeout(500);
  console.log('gallery imgs', await g.locator('main img').count(), 'loaded', await g.evaluate(() => [...document.images].filter(i => i.naturalWidth > 0).length));
  await g.locator('.heart').nth(0).click();
  await g.locator('main img').nth(1).click(); await g.keyboard.press(' '); await g.keyboard.press('Escape');
  await g.click('#save').catch(()=>{});
  await g.click('#copy'); const list = await g.inputValue('#txt');
  console.log('client list:\n' + list);
  await g.setViewportSize({ width: 390, height: 800 }); await g.screenshot({ path: W + '/gallery-phone.png' });
  await p.bringToFront();
  await p.fill('#pfBack', list); await p.click('#pfApply');
  console.log('back:', await p.textContent('#pfBackState'));
  await p.selectOption('#filter', 'labelled');
  console.log('labelled tiles', await p.locator('.tile').count());
  console.log('errors', errs);
  await b.close();
})();
