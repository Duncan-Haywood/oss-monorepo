// Draws a house on the plan sketch grid with real mouse clicks, then loads it into the walls table.
// `node eval-sketch-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
// Finds playwright on the import path, PLAYWRIGHT_PATH (file or package dir), or /opt/node-tools.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
let chromium;
const { existsSync, statSync } = await import("node:fs");
// playwright is not on the default import path in cloud containers; try the
// env override (a file or a package directory) and the known container path.
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => {
  if (!c.startsWith("/") || !existsSync(c)) return c;
  return statSync(c).isDirectory() ? join(c, "index.mjs") : c;
});
for (const c of candidates) {
  try { const m = await import(c.startsWith("/") ? "file://" + c : c); chromium = (m.default ?? m).chromium; if (chromium) break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, req.url.split("?")[0] === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); } catch (e) { console.log("skipped: no Chromium:", e.message.split("\n")[0]); server.close(); process.exit(0); }
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const click = async (x, y) => {
  await page.locator("#skSvg").scrollIntoViewIfNeeded();
  const pt = await page.evaluate(([x, y]) => { const s = document.querySelector("#skSvg"); const p = s.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(s.getScreenCTM()); return { x: q.x, y: q.y }; }, [x, y]);
  await page.mouse.move(pt.x, pt.y); await page.mouse.click(pt.x, pt.y);
};
let bad = 0;
const check = (ok, msg) => { console.log((ok ? "ok: " : "FAIL: ") + msg); if (!ok) bad++; };
await page.click("#skClear");
// 20 x 14 ft rectangle with square walls on, then a partition, a door and a window
for (const [x, y] of [[0, 0], [240, 0], [240, 168], [0, 168], [0, 0]]) await click(x, y);
await page.click("#skFinish");
await click(120, 0); await click(120, 168); await page.click("#skFinish");
await page.selectOption("#skTool", "door"); await page.fill("#skWidth", "36"); await click(60, 0);
await page.selectOption("#skTool", "window"); await page.fill("#skWidth", "48"); await click(240, 84);
check((await page.textContent("#skInfo")).startsWith("5 walls, 1 door, 1 window"), "sketch counts: " + await page.textContent("#skInfo"));
await page.click("#skUse");
const rows = await page.evaluate(() => document.querySelectorAll("#walls tr").length);
check(rows === 5, "walls table has 5 rows (" + rows + ")");
await page.click("#run");
await page.waitForTimeout(300);
const out = await page.innerText("body");
check(!/CHECK FAILED|NaN|undefined/.test(out) && /Door 1/.test(out) && /Window 1/.test(out), "takeoff runs on the sketched house with its door and window");
// undo and erase
await page.click("#skUndo");
await page.selectOption("#skTool", "erase"); await click(120, 100);
check((await page.textContent("#skInfo")).startsWith("4 walls"), "erase removes the partition: " + await page.textContent("#skInfo"));
// typed length: wall from (0,0) toward the right, 10 ft regardless of cursor
await page.click("#skClear");
await page.selectOption("#skTool", "wall"); await page.fill("#skLen", "10 ft");
await click(0, 0); await click(300, 6);
const w = await page.evaluate(() => document.querySelector("#skSvg text")?.textContent);
check(w && w.includes("10"), "typed length makes a 10 ft wall (label " + w + ")");
// move: drag the right-hand corner of a 20 x 14 ft box out 4 ft with a real mouse drag
await page.click("#skClear");
for (const [x, y] of [[0, 0], [240, 0], [240, 168], [0, 168], [0, 0]]) await click(x, y);
await page.click("#skFinish");
await page.selectOption("#skTool", "move");
const toScreen = (x, y) => page.evaluate(([x, y]) => { const s = document.querySelector("#skSvg"); const p = s.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(s.getScreenCTM()); return { x: q.x, y: q.y }; }, [x, y]);
const from = await toScreen(240, 168), to = await toScreen(288, 168);
await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
const labels = await page.evaluate(() => [...document.querySelectorAll("#skSvg text")].map((t) => t.textContent));
check(labels.some((l) => l.includes("24")), "dragging a corner out 4 ft makes a 24 ft wall (labels " + labels.join("|") + ")");
await page.click("#skUndo");
const back = await page.evaluate(() => [...document.querySelectorAll("#skSvg text")].map((t) => t.textContent));
check(!back.some((l) => l.includes("24")), "undo puts the corner back");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
await browser.close(); server.close();
process.exit(bad ? 1 : 0);
