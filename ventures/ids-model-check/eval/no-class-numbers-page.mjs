// The editor page on no-class number rows, driven in Chromium (Playwright):
// opens an IDS whose specifications name no class and ask for
// CoordinateSpaceDimension one of 3 (derived on the subcontext) and CountValue
// one of 32 on xs:integer (IfcCountMeasure is a NUMBER in IFC4), checks both
// open as editable rows with their notes, downloads the IDS and checks it
// writes the same bases; then types "2.5" into CountValue's add field and
// checks the whole-number warning.
//   node eval/no-class-numbers-page.mjs [SCREENSHOT.png]   (eval/no-class-numbers-2026-11-17.md)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = new URL("..", import.meta.url).pathname;
const spec = (name, base, v) => `<specification name="${name}" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><attribute><name><simpleValue>${name}</simpleValue></name></attribute></applicability>
<requirements><attribute><name><simpleValue>${name}</simpleValue></name><value><xs:restriction base="${base}"><xs:enumeration value="${v}"/></xs:restriction></value></attribute></requirements></specification>`;
const ids = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>No-class numbers</title></info><specifications>
${spec("CoordinateSpaceDimension", "xs:integer", "3")}${spec("CountValue", "xs:integer", "32")}</specifications></ids>`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ids-noclass-num-"));
const idsPath = path.join(tmp, "n.ids");
fs.writeFileSync(idsPath, ids);
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".xml": "application/xml", ".xsd": "application/xml" };
const srv = http.createServer((req, res) => {
  const root = path.resolve(dir);
  const p = path.resolve(root, "." + decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); res.end(b); });
}).listen(0, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${srv.address().port}/editor.html`);
  await page.setInputFiles("#open", idsPath);
  await page.waitForFunction(() => /CountValue/.test(document.body.textContent) && document.querySelectorAll("[data-act]").length > 3);
  const kept = await page.$$eval(".req.kept", (x) => x.length);
  const ticked = await page.$$eval('input[data-k="oneOf"]:checked', (x) => x.map((i) => i.value));
  const notes = await page.$$eval("p.muted", (ps) => ps.map((p) => p.textContent.replace(/\s+/g, " ").trim()));
  const derived = notes.find((t) => /derived on/.test(t)) || null;
  const intBase = notes.find((t) => /Written on xs:integer/.test(t)) || null;
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  const xml = fs.readFileSync(await dl.path(), "utf8");
  const bases = [...xml.matchAll(/<xs:restriction base="([^"]+)"/g)].map((m) => m[1]);
  const adds = await page.$$('input[data-k="oneOfAdd"]');
  await adds[adds.length - 1].fill("2.5");
  await adds[adds.length - 1].press("Enter");
  await page.waitForTimeout(300);
  const warn = await page.$$eval("p.warn", (ps) => ps.map((p) => p.textContent.replace(/\s+/g, " ").trim()).find((t) => /2\.5/.test(t)) || null);
  if (process.argv[2]) await page.screenshot({ path: process.argv[2], fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await browser.close(); srv.close();
  fs.unlinkSync(idsPath); fs.rmdirSync(tmp);
  console.log(JSON.stringify({ kept, ticked, derived, intBase, bases, warn, wide, errors }, null, 1));
  const ok = kept === 0 && ticked.join() === "3,32" && derived && intBase && bases.join() === "xs:integer,xs:integer" && warn && !wide && !errors.length;
  console.log(ok ? "OK" : "FAILED");
  process.exit(ok ? 0 : 1);
});
