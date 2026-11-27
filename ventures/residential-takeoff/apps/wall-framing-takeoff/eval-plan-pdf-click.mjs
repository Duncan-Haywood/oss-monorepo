// Loads a plan PDF (the PDF Plan Takeoff sample sheet) as the sketch underlay and traces its outside walls with real clicks.
// `node eval-plan-pdf-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
// Finds playwright on the import path, PLAYWRIGHT_PATH (file or package dir), or /opt/node-tools.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, sep } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const serveRoot = resolve(root);
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
    const p = resolve(join(root, req.url.split("?")[0] === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0])));
    if (!p.startsWith(serveRoot + sep)) throw new Error("outside root");
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
const { samplePdf } = await import("./sample.mjs");
await page.click("#skClear");
await page.setInputFiles("#skImg", { name: "A-101.pdf", mimeType: "application/pdf", buffer: Buffer.from(samplePdf()) });
await page.waitForSelector("#skSvg image");
const imgW = () => page.evaluate(() => Number(document.querySelector("#skSvg image").getAttribute("width")));
// 17 in of sheet at 1/4" = 1'-0" is 68 ft
check(Math.abs((await imgW()) - 816) < 0.01, "sheet placed at its printed scale, 68 ft across (" + await imgW() + ")");
const info = await page.textContent("#skInfo");
check(/1\/4" = 1'-0"/.test(info) && /4 of the sheet's 6 dimension strings/.test(info), "says which scale and why: " + info.slice(0, 140));
check(!(await page.isHidden("#skPdfPage")), "a two-page PDF offers a sheet picker");
// the building's outside corners in grid inches (sheet points x 48/72, y measured down), clicked a little off
const k = 48 / 72, C = [[120, 200], [768, 200], [768, 632], [120, 632]].map(([x, y]) => [x * k, (792 - y) * k]);
for (const [x, y] of [...C, C[0]]) await click(x + 2, y + 1.5);
await page.click("#skFinish");
const labels = await page.evaluate(() => [...document.querySelectorAll("#skSvg > text")].map((t) => t.textContent));
check(labels.filter((t) => /^36' ?-? ?0"?$|^36'$/.test(t.replace(/\s/g, "").replace("36'0\"", "36'"))).length === 2 && labels.filter((t) => /^24'/.test(t.replace(/\s/g, ""))).length === 2, "clicks snap to the drawn corners: walls 36 ft and 24 ft (" + labels.join(", ") + ")");
await page.click("#skUse");
await page.click("#run");
await page.waitForTimeout(300);
const out = await page.innerText("body");
check(!/CHECK FAILED|NaN|undefined/.test(out), "takeoff runs on the traced walls");
// page 2 is the same sheet printed at half size: the dimension check doubles the scale, so it is placed the same size
await page.selectOption("#skPdfPage", "2");
await page.waitForFunction(() => /half size/.test(document.querySelector("#skInfo").textContent));
check(Math.abs((await imgW()) - 816) < 0.01, "the half-size print is placed at the real size too (" + await imgW() + ")");
// snapping can be turned off: the grid rules again
await page.click("#skClear"); await page.uncheck("#skPdfSnap"); await page.selectOption("#skGrid", "1");
await click(C[0][0] + 2, C[0][1] + 1.5); await click(C[1][0] + 5, C[1][1] + 1.5); await page.click("#skFinish");
const off = await page.evaluate(() => [...document.querySelectorAll("#skSvg > text")].map((t) => t.textContent));
check(off.length === 1 && /^36' [2-5]"$/.test(off[0]), "with snapping off the wall follows the grid (" + off.join(", ") + ")");
await page.check("#skPdfSnap");
// a file that is not a PDF says so
await page.setInputFiles("#skImg", { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("hello") });
await page.waitForFunction(() => /not a PDF/.test(document.querySelector("#skInfo").textContent));
check(true, "a non-PDF named .pdf is refused with a message");
await page.click("#skImgOff");
check((await page.$("#skSvg image")) === null && await page.isHidden("#skPdfPageWrap"), "remove picture clears the sheet and its picker");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
await browser.close(); server.close();
process.exit(bad ? 1 : 0);
