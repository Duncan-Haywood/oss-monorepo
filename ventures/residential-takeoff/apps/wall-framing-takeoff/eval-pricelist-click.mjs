// Clicks index.html in a real browser: a supplier price list (CSV) loaded on the page reprices the lumber table, drops the unlisted lengths of a priced size, fills the budget's prices and names the rows it did not read.
// `node eval-pricelist-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, sep } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const serveRoot = resolve(root);
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
    const p = resolve(join(root, decodeURIComponent(req.url.split("?")[0])));
    if (!p.startsWith(serveRoot + sep)) throw new Error("outside root");
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
await page.click("#run");
const csv = "description,price,unit\n2x4-8' SPF,4.12,EA\n2x4x12,6.20,EA\n2x4x16,8.90,EA\n2x4 92-5/8 precut stud,3.98,EA\n7/16 OSB 4x8 wall sheathing,17.25,EA\nDelivery,75,EA\n";
await page.setInputFiles("#priceListFile", { name: "yard.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
await page.waitForFunction(() => document.querySelector("#priceListOut").textContent.length > 0);
const out = await page.textContent("#priceListOut");
check(/4 board prices replaced/.test(out), "notes the four boards repriced");
check(/line 7 "Delivery"/.test(out), "names the row it did not read");
check(/wallSheet 17.25/.test(out), "fills the wall sheet price");
const rows = await page.$$eval("#stock tr", (trs) => trs.map((tr) => [...tr.querySelectorAll("select, input")].map((x) => x.value)));
const twoBy4 = rows.filter((r) => r[0] === "2x4");
check(twoBy4.length === 4, `2x4 rows are the four listed (${JSON.stringify(twoBy4)})`);
check(twoBy4.some((r) => r.includes("4.12")), "the 8 ft 2x4 carries the yard's 4.12");
check(/wallSheet, 17.25/.test(await page.inputValue("#priceText")), "the price text area has wallSheet, 17.25");
await page.waitForTimeout(300);
check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
server.close();
process.exit(fail);
