// Real-browser check of index.html: serves this folder, drives headless Chromium.
// Run: node eval/browser-e2e.mjs   (needs Playwright + Chromium; not part of `node --test`)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".gabc": "text/plain", ".md": "text/plain" };
const server = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/^\//, "") || "index.html");
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404).end(); return; }
  r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }).end(fs.readFileSync(f));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ acceptDownloads: true });
const problems = [], log = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
await page.goto(url);
const ok = (c, msg) => { log.push((c ? "ok   " : "FAIL ") + msg); if (!c) problems.push(msg); };
const out = () => page.locator("#out").textContent();
const pieces = await page.locator("#piece option").evaluateAll((o) => o.map((x) => x.value));
const genres = await page.locator("#genre option").evaluateAll((o) => o.map((x) => x.value));
for (const p of pieces) {
  await page.selectOption("#piece", p);
  if (p) await page.waitForFunction(() => document.querySelector("#src").value.includes("%%"));
  for (const g of genres) {
    await page.selectOption("#genre", g);
    await page.click("#go");
    const t = await out();
    const good = /notes,/.test(t) && !(await page.locator("#dlmid").isDisabled());
    ok(good, `${p || "default"} + ${g || "none"}: ${t.split("\n")[0].slice(0, 70)}`);
  }
}
// downloads
await page.selectOption("#piece", ""); await page.selectOption("#genre", "metal"); await page.click("#go");
const [d1] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
const mid = fs.readFileSync(await d1.path());
ok(mid.subarray(0, 4).toString() === "MThd" && mid.length > 200, `MIDI download ${mid.length} bytes, header MThd`);
const [d2] = await Promise.all([page.waitForEvent("download"), page.click("#dlwav")]);
const wav = fs.readFileSync(await d2.path());
ok(wav.subarray(0, 4).toString() === "RIFF" && wav.subarray(8, 12).toString() === "WAVE" && wav.length > 100000, `WAV download ${wav.length} bytes, RIFF/WAVE`);
let peak = 0; for (let i = 44; i + 1 < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
ok(peak > 1000, `WAV is not silent (peak ${peak}/32767)`);
// playback
await page.click("#play");
await page.waitForTimeout(300);
ok(!(await page.locator("#stop").isDisabled()), "Play enables Stop");
await page.click("#stop");
ok(await page.locator("#stop").isDisabled(), "Stop disables Stop");
// song sections: every sample with every genre plans sections and still converts
await page.selectOption("#sections", "1");
for (const p of pieces.filter(Boolean)) {
  await page.selectOption("#piece", p);
  await page.waitForFunction(() => document.querySelector("#src").value.includes("%%"));
  for (const g of genres.filter(Boolean)) {
    await page.selectOption("#genre", g);
    await page.click("#go");
    const t = await out();
    ok(/Sections: Intro bar 1-2.*Outro/.test(t) && !(await page.locator("#dlmid").isDisabled()), `sections ${p} + ${g}: ${(t.match(/Sections: .*/) || ["none"])[0].slice(0, 70)}`);
  }
}
await page.selectOption("#sections", "");
// errors
await page.fill("#src", "hello");
await page.click("#go");
ok(/No notes found/.test(await out()) && (await page.locator("#play").isDisabled()), "bad input shows message and disables buttons");
await page.fill("#bpm", "0"); await page.fill("#src", "mode: 1;\n%%\n(c4) A(f)men.(e)");
await page.click("#go");
ok(/Tempo/.test(await out()), "zero tempo is refused");
// phone width
await page.setViewportSize({ width: 375, height: 700 });
const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
ok(!over, "no horizontal scroll at 375px");
console.log(log.join("\n"));
await browser.close(); server.close();
if (problems.length) { console.error("\nPROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log(`\nall ${log.length} checks passed`);
