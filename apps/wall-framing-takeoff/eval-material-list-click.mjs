// Clicks index.html in a real browser: the supplier material list button downloads one CSV with the walls, the wall
// sheathing and the roof of the example house. `node eval-material-list-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";
import { confinedPath } from "./static-path.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
let chromium;
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) =>
  !c.startsWith("/") || !existsSync(c) ? c : statSync(c).isDirectory() ? join(c, "index.mjs") : c);
for (const c of candidates) {
  try { const m = await import(c.startsWith("/") ? "file://" + c : c); chromium = (m.default ?? m).chromium; if (chromium) break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript" };
const server = createServer(async (req, res) => {
  try {
    const p = confinedPath(root, req.url);
    if (!p) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); } catch (e) { console.log("skipped: no Chromium:", e.message.split("\n")[0]); server.close(); process.exit(0); }
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
let fail = 0;
const check = (ok, msg) => { console.log((ok ? "ok: " : "FAIL: ") + msg); if (!ok) fail = 1; };
await page.click("#example");
await page.check("#sheath");
await page.check("#rfOn");
await page.click("#run");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#mlCsv")]);
check(dl.suggestedFilename() === "material-list.csv", `file name ${dl.suggestedFilename()}`);
const csv = (await readFile(await dl.path(), "utf8")).trimEnd().split("\n");
check(csv[0] === "section,item,size,length,qty,unit,note", `header ${csv[0]}`);
for (const s of ["Framing lumber", "Members cut from those boards", "Wall sheathing", "Roof"]) check(csv.some((l) => l.startsWith(s + ",")), `has ${s}`);
check(csv.some((l) => l.startsWith("Roof,roof area,")), "roof squares on the list");
check(errors.length === 0, `no page errors ${errors.join("; ")}`);
await browser.close();
server.close();
process.exit(fail);
