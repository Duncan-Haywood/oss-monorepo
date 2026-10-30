// The app driven in a real browser at phone (390 px) and laptop (1280 px) width:
// load the invented example, add a lead, turn it into a family, book a sit, record a
// payment, check the tax panel, reload and find it all still there. Then keyboard
// tabs, touch-target sizes, the guide pages, and the offline service worker.
//
// Skips when Playwright cannot be loaded (CI's venture runner has no browser). Run
// it locally with `node --test e2e.test.mjs`; set PLAYWRIGHT to playwright's
// index.js if it is not on the module path.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
function loadPlaywright() {
  for (const p of [process.env.PLAYWRIGHT, "/opt/node-tools/node_modules/playwright/index.js"].filter(Boolean)) {
    if (!existsSync(p)) continue;
    try { return createRequire(import.meta.url)(p); } catch { /* next */ }
  }
  try { return createRequire(import.meta.url)("playwright"); } catch { return null; }
}
const pw = loadPlaywright();
// Launch up front so a Playwright without its browser download skips rather than fails.
const browser = pw ? await pw.chromium.launch().catch(() => null) : null;
const skip = browser ? false : pw ? "Chromium for Playwright is not installed" : "Playwright not found (set PLAYWRIGHT to its index.js)";
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain" };
let server, base;

before(async () => {
  if (skip) return;
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(ROOT, path === "" ? "index.html" : path);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { await browser?.close(); server?.close(); });

async function open(t, width, path = "") {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, hasTouch: width < 600 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("dialog", (d) => d.accept());
  await page.goto(base + path);
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], "no page errors"); });
  return page;
}
const paidToYou = (page) => page.$eval("#taxOut", (el) => Number(/Paid to you\$([\d.]+)/.exec(el.textContent.replace(/,/g, ""))[1]));

for (const width of [390, 1280]) {
  test(`at ${width} px: example, lead, family, sit, payment, taxes, and it all survives a reload`, { skip }, async (t) => {
    const page = await open(t, width);
    await page.click("#loadExample");
    await page.waitForSelector("#todayList .card");
    const today = await page.evaluate(() => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10));

    await page.click('[data-tab="leads"]');
    await page.fill("#l_name", "Pat Testerson");
    await page.fill("#l_contact", "pat@example.com");
    await page.fill("#l_kids", "4, 7");
    await page.fill("#l_schedule", "Fri 18-22");
    await page.click('#leadForm button[type="submit"]');
    const row = page.locator("#leadsList tr", { hasText: "Pat Testerson" });
    await row.waitFor();
    await row.locator("button[data-book]").click();

    assert.equal(await page.getAttribute('[data-tab="schedule"]', "aria-selected"), "true");
    assert.match(await page.$eval("#b_family", (s) => s.selectedOptions[0].textContent), /Testerson family/);
    await page.fill("#b_date", today);
    await page.fill("#b_start", "18:00");
    await page.fill("#b_end", "22:00");
    await page.fill("#b_kids", "2");
    await page.dispatchEvent("#bookingForm", "input");
    assert.match(await page.textContent("#quoteOut"), /Quote: \$\d+\.\d\d/);
    await page.click('#bookingForm button[type="submit"]');
    await page.locator("#bookingsList tr", { hasText: "Testerson family" }).waitFor();

    await page.click('[data-tab="money"]');
    const before = await paidToYou(page);
    const option = await page.$eval("#p_booking", (s) => [...s.options].find((o) => o.textContent.includes("Testerson family")).value);
    await page.selectOption("#p_booking", option);
    await page.fill("#p_amount", "92");
    await page.fill("#p_date", today);
    await page.click('#payForm button[type="submit"]');
    await page.waitForFunction((b) => document.querySelector("#taxOut").textContent.replace(/,/g, "").includes(`Paid to you$${(b + 92).toFixed(2)}`), before);
    assert.match(await page.textContent("#taxOut"), /Set aside\$[\d,]+\.\d\d/);
    assert.match(await page.textContent("#taxOut"), /Estimated payment due/);

    await page.reload();
    await page.click('[data-tab="leads"]');
    assert.match(await page.textContent("#leadsList"), /Pat Testerson[\s\S]*booked/);
    await page.click('[data-tab="families"]');
    assert.match(await page.textContent("#familiesList"), /Testerson family/);
    await page.click('[data-tab="money"]');
    assert.equal(await paidToYou(page), before + 92);

    if (width < 600) {
      const nav = await page.locator("nav").boundingBox();
      assert.ok(nav.y + nav.height >= 844 - 1, `tab bar sits at the bottom (ends at ${nav.y + nav.height})`);
      const small = await page.$$eval("nav button, main section:not([hidden]) button, main section:not([hidden]) input:not([type=checkbox]):not([type=file]), main section:not([hidden]) select", (els) => els.filter((e) => e.offsetParent).map((e) => [e.textContent.trim() || e.id, e.getBoundingClientRect().height]).filter(([, h]) => h < 44));
      assert.deepEqual(small, [], "touch targets under 44 px");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scrolling");
    }
  });
}

test("keyboard: arrow keys, Home and End move between tabs and each tab controls its panel", { skip }, async (t) => {
  const page = await open(t, 1280);
  const tabs = await page.$$eval('[role="tab"]', (els) => els.map((e) => ({ id: e.id, controls: e.getAttribute("aria-controls"), tabIndex: e.tabIndex, selected: e.getAttribute("aria-selected") })));
  for (const tab of tabs) {
    assert.ok(tab.id && tab.controls, JSON.stringify(tab));
    assert.equal(await page.$eval(`#${tab.controls}`, (p, id) => p.getAttribute("role") === "tabpanel" && p.getAttribute("aria-labelledby") === id, tab.id), true);
  }
  assert.deepEqual(tabs.filter((x) => x.tabIndex === 0).map((x) => x.selected), ["true"]);
  await page.focus('[data-tab="today"]');
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), "leads");
  assert.equal(await page.isVisible('[data-panel="leads"]'), true);
  await page.keyboard.press("End");
  const last = tabs[tabs.length - 1].controls;
  assert.equal(await page.isVisible(`#${last}`), true);
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), "today");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Home");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), "today");
  assert.equal(await page.$eval('[data-tab="today"]', (e) => e.tabIndex), 0);
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.equal(ring, "solid", "a visible focus ring");
});

for (const g of ["how-to-start-a-babysitting-business.html", "how-much-to-charge-for-babysitting.html", "babysitting-references.html"]) {
  test(`${g} renders at 390 px without errors or sideways scrolling, and links into the app`, { skip }, async (t) => {
    const page = await open(t, 390, g);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.click("a.cta");
    await page.waitForSelector('[role="tablist"]');
  });
}

test("installed: the service worker caches the app and it opens offline", { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await ctx.newPage();
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForFunction(() => caches.keys().then((k) => k.length > 0));
    const cached = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).map((r) => new URL(r.url).pathname));
    for (const f of ["/", "/index.html", "/engine.mjs", "/usage.mjs", "/tabs.mjs", "/manifest.webmanifest"]) assert.ok(cached.includes(f), `${f} cached`);
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('[role="tablist"]');
    await page.click('[data-tab="money"]');
    assert.match(await page.textContent("#taxOut"), /Paid to you/);
  } finally { await ctx.close(); }
});
